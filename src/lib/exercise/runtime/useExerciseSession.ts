'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from '@/lib/utils/useLatest';
import { PoseEngine, type EngineError, type EngineStatus } from './PoseEngine';
import { ScoreSync } from './ScoreSync';
import { getExercise } from '../registry';
import type { DetectorResult, ExerciseDetector, Landmark } from '../types';
import type { PlayerSlot, ScoreMeta } from '@/lib/battle/types';

export type CountingMode = 'camera' | 'manual';

interface Options {
  exerciseId: string;
  mode: CountingMode;
  slot: PlayerSlot | null;
  /** Counting only happens while this is true (i.e. between GO and t=0). */
  active: boolean;
  write: (
    slot: PlayerSlot,
    score: number,
    meta: ScoreMeta,
    final: boolean,
  ) => Promise<void>;
}

export interface SessionState {
  count: number;
  result: DetectorResult | null;
  landmarks: Landmark[] | null;
  engineStatus: EngineStatus;
  error: EngineError | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<boolean>;
  stop: () => void;
  adjust: (delta: number) => void;
  /** Push the last value with the `final` latch. Called once at t=0. */
  finalize: () => Promise<void>;
}

/**
 * Binds the camera, the detector and the throttled writer for one athlete.
 *
 * The detector is deliberately not React state: it is mutated at frame rate
 * and only the derived count is lifted into state, so the component tree
 * re-renders on reps rather than on frames.
 */
export function useExerciseSession({
  exerciseId,
  mode,
  slot,
  active,
  write,
}: Options): SessionState {
  const spec = useMemo(() => getExercise(exerciseId), [exerciseId]);

  // The detector is mutated at frame rate, so it lives in a ref rather than
  // state. useMemo gives us one instance per (mode, exercise) without touching
  // a ref during render.
  const detector = useMemo(
    () => (mode === 'camera' ? spec.create() : spec.createManual()),
    [mode, spec],
  );
  const detectorRef = useLatest(detector);

  const engineRef = useRef<PoseEngine | null>(null);
  const syncRef = useRef<ScoreSync | null>(null);
  const activeRef = useLatest(active);

  const [count, setCount] = useState(0);
  const [result, setResult] = useState<DetectorResult | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<EngineError | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // A new detector means a fresh session. Resetting during render (the
  // documented "adjust state on prop change" pattern) avoids briefly painting
  // the previous mode's total, which an effect-based reset would allow.
  const [lastDetector, setLastDetector] = useState(detector);
  if (lastDetector !== detector) {
    setLastDetector(detector);
    setCount(0);
    setResult(null);
  }

  // One ScoreSync per slot, created lazily so a spectator never writes.
  useEffect(() => {
    if (slot === null) return;
    syncRef.current = new ScoreSync(write, slot);
    return () => {
      syncRef.current?.cancel();
      syncRef.current = null;
    };
  }, [slot, write]);

  const metaOf = useCallback((det: ExerciseDetector, total: number): ScoreMeta => {
    const auto = (det as { autoReps?: number }).autoReps ?? 0;
    return {
      autoReps: auto,
      // The rules assert autoReps + manualAdjust === score. Deriving the
      // adjustment from the total keeps that invariant true by construction
      // rather than trusting two separately tracked counters to agree.
      manualAdjust: total - auto,
      source: det.usesCamera ? 'camera' : 'manual',
    };
  }, []);

  /** Called for every processed frame (camera) or tap (manual). */
  const consume = useCallback(
    (r: DetectorResult) => {
      setResult(r);
      setCount(r.count);

      if (activeRef.current && slot !== null && detectorRef.current) {
        syncRef.current?.push(r.count, metaOf(detectorRef.current, r.count));
      }

      if (r.justCounted && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(25);
        } catch {
          /* unsupported */
        }
      }
    },
    [slot, metaOf, activeRef, detectorRef],
  );

  const onFrame = useCallback(
    (lms: Landmark[] | null, tMs: number) => {
      // A reference comparison, once per frame. If React rebuilt the <video>
      // element the engine is still pumping the old, detached node — live
      // stream, readyState >= 2, landmarks flowing, nothing on screen. This
      // re-points it at the mounted element without disturbing the stream.
      //
      // The structural fix lives in the battle page (one CameraStage for every
      // phase); this is the guard that makes any FUTURE remount survivable
      // rather than silently black, which is the worst way for the only screen
      // that matters to fail.
      const el = videoRef.current;
      if (el) engineRef.current?.reattach(el);

      setLandmarks(lms);
      const det = detectorRef.current;
      if (!det) return;
      // Frames are always processed so the athlete sees live form feedback
      // while setting up; only WRITES are gated on `active`.
      consume(det.process(lms, tMs));
    },
    [consume, detectorRef],
  );

  const start = useCallback(async () => {
    if (mode !== 'camera') return true;
    if (!videoRef.current) return false;

    engineRef.current?.dispose();
    const engine = new PoseEngine({
      onFrame,
      onStatus: setEngineStatus,
      onError: setError,
      targetFps: 30,
    });
    engineRef.current = engine;
    setError(null);
    return engine.start(videoRef.current);
  }, [mode, onFrame]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const adjust = useCallback(
    (delta: number) => {
      const det = detectorRef.current;
      if (!det?.tap) return;
      det.tap(delta);
      // Reflect the change immediately rather than waiting for the next frame,
      // which matters a lot in manual mode where there are no frames.
      consume(det.process(null, performance.now()));
    },
    [consume, detectorRef],
  );

  const finalize = useCallback(async () => {
    const det = detectorRef.current;
    if (!det || slot === null) return;
    const total = det.process(null, performance.now()).count;
    await syncRef.current?.finalFlush(total, metaOf(det, total));
  }, [slot, metaOf, detectorRef]);

  // Release the camera on unmount — otherwise the indicator light stays on.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return {
    count,
    result,
    landmarks,
    engineStatus,
    error,
    videoRef,
    start,
    stop,
    adjust,
    finalize,
  };
}
