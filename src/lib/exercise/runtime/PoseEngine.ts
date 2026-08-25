'use client';

import type { Landmark } from '../types';

/**
 * MediaPipe PoseLandmarker lifecycle and frame pump.
 *
 * Design notes:
 * - The model and WASM are self-hosted from /public, so the app has no CDN
 *   dependency at runtime and works behind a strict CSP.
 * - Frames are pumped with requestVideoFrameCallback where available: it fires
 *   once per decoded video frame rather than once per display refresh, so we
 *   never run inference twice on the same image.
 * - detectForVideo is synchronous and can take 10-30ms. A `busy` flag drops
 *   frames rather than queueing them, which keeps the UI thread responsive
 *   under load instead of building an ever-growing backlog.
 * - Video never leaves the device: only the resulting rep count is written to
 *   Firestore.
 */

export type EngineStatus =
  | 'idle'
  | 'loading-model'
  | 'requesting-camera'
  | 'running'
  | 'error';

export type CameraErrorKind =
  | 'permission-denied'
  | 'no-camera'
  | 'in-use'
  | 'insecure-context'
  | 'unsupported'
  | 'model-failed'
  | 'unknown';

export interface EngineError {
  kind: CameraErrorKind;
  message: string;
}

/** Human-readable, actionable copy for each failure mode. */
export function describeCameraError(kind: CameraErrorKind): string {
  switch (kind) {
    case 'permission-denied':
      return "Accès caméra refusé. Autorise la caméra dans les réglages de ton navigateur, ou passe en comptage manuel.";
    case 'no-camera':
      return 'Aucune caméra détectée sur cet appareil.';
    case 'in-use':
      return 'La caméra est déjà utilisée par une autre application.';
    case 'insecure-context':
      return 'La caméra nécessite une connexion sécurisée (HTTPS).';
    case 'unsupported':
      return "Ce navigateur ne supporte pas l'accès caméra.";
    case 'model-failed':
      return 'Le modèle de détection n’a pas pu être chargé.';
    default:
      return 'Impossible de démarrer la caméra.';
  }
}

function classifyMediaError(e: unknown): CameraErrorKind {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'insecure-context';
  }
  const name = (e as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-camera';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    default:
      return 'unknown';
  }
}

interface PoseLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestamp: number): {
    landmarks: Landmark[][];
  };
  close(): void;
}

export interface PoseEngineOptions {
  onFrame: (landmarks: Landmark[] | null, tMs: number) => void;
  onStatus?: (status: EngineStatus) => void;
  onError?: (err: EngineError) => void;
  /** Detection cap. 30fps is plenty for a movement of ~1Hz and saves battery. */
  targetFps?: number;
}

export class PoseEngine {
  private landmarker: PoseLandmarkerLike | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  private running = false;
  private busy = false;
  private rafId: number | null = null;
  private vfcId: number | null = null;
  private lastDetectMs = 0;
  private lastTimestamp = -1;
  private detachPlayListeners: (() => void) | null = null;

  private status: EngineStatus = 'idle';

  constructor(private readonly opts: PoseEngineOptions) {}

  getStatus(): EngineStatus {
    return this.status;
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.opts.onStatus?.(s);
  }

  private fail(kind: CameraErrorKind) {
    this.setStatus('error');
    this.opts.onError?.({ kind, message: describeCameraError(kind) });
  }

  /** Load the model. Safe to call before the user grants camera access. */
  async loadModel(): Promise<boolean> {
    if (this.landmarker) return true;
    this.setStatus('loading-model');
    try {
      const { FilesetResolver, PoseLandmarker } = await import(
        '@mediapipe/tasks-vision'
      );
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      this.landmarker = (await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: '/models/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })) as unknown as PoseLandmarkerLike;
      return true;
    } catch {
      // GPU delegate can fail on some drivers; retry once on CPU before
      // declaring the model unusable.
      try {
        const { FilesetResolver, PoseLandmarker } = await import(
          '@mediapipe/tasks-vision'
        );
        const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        this.landmarker = (await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        })) as unknown as PoseLandmarkerLike;
        return true;
      } catch {
        this.fail('model-failed');
        return false;
      }
    }
  }

  /** Request the camera and begin pumping frames into the detector. */
  async start(video: HTMLVideoElement): Promise<boolean> {
    this.video = video;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.fail(
        typeof window !== 'undefined' && !window.isSecureContext
          ? 'insecure-context'
          : 'unsupported',
      );
      return false;
    }

    if (!(await this.loadModel())) return false;

    this.setStatus('requesting-camera');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
    } catch (e) {
      this.fail(classifyMediaError(e));
      return false;
    }

    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;

    // Playback has to be (re)started rather than assumed. A single play() at
    // attach time is not enough: if the element is not ready yet, or React
    // remounts it, the video silently never plays — and the symptom is
    // baffling, because detection reads the MediaStream directly and keeps
    // drawing the skeleton over a black rectangle.
    const tryPlay = () => {
      video.play().catch(() => {
        /* a rejected play is retried on the next metadata/canplay event */
      });
    };
    video.addEventListener('loadedmetadata', tryPlay);
    video.addEventListener('canplay', tryPlay);
    this.detachPlayListeners = () => {
      video.removeEventListener('loadedmetadata', tryPlay);
      video.removeEventListener('canplay', tryPlay);
    };
    tryPlay();

    this.running = true;
    this.setStatus('running');
    this.pump();
    return true;
  }

  /** Schedule the next frame, preferring per-video-frame callbacks. */
  private pump = (): void => {
    if (!this.running || !this.video) return;

    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };

    if (typeof v.requestVideoFrameCallback === 'function') {
      this.vfcId = v.requestVideoFrameCallback(() => {
        this.tick();
        this.pump();
      });
    } else {
      this.rafId = requestAnimationFrame(() => {
        this.tick();
        this.pump();
      });
    }
  };

  private tick(): void {
    if (!this.running || !this.landmarker || !this.video) return;

    const video = this.video;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    const now = performance.now();
    const minGap = 1000 / (this.opts.targetFps ?? 30);
    if (now - this.lastDetectMs < minGap) return;

    // Drop the frame rather than queue it: inference is synchronous, and a
    // backlog would show up as UI jank exactly when the athlete is mid-effort.
    if (this.busy) return;

    this.busy = true;
    this.lastDetectMs = now;
    try {
      // MediaPipe requires strictly increasing timestamps.
      const ts = Math.max(this.lastTimestamp + 1, Math.round(now));
      this.lastTimestamp = ts;

      const result = this.landmarker.detectForVideo(video, ts);
      const lms = result?.landmarks?.[0] ?? null;
      this.opts.onFrame(lms && lms.length ? lms : null, now);
    } catch {
      // A single bad frame is not fatal; the next one usually recovers.
      this.opts.onFrame(null, now);
    } finally {
      this.busy = false;
    }
  }

  /** Stop the pump and release the camera. Idempotent. */
  stop(): void {
    this.running = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const v = this.video as
      | (HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void })
      | null;
    if (this.vfcId !== null && v?.cancelVideoFrameCallback) {
      v.cancelVideoFrameCallback(this.vfcId);
      this.vfcId = null;
    }

    this.detachPlayListeners?.();
    this.detachPlayListeners = null;

    // Releasing every track is what turns the camera indicator light off.
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.setStatus('idle');
  }

  /** Full teardown, including the model. Call on unmount. */
  dispose(): void {
    this.stop();
    try {
      this.landmarker?.close();
    } catch {
      /* already closed */
    }
    this.landmarker = null;
  }
}
