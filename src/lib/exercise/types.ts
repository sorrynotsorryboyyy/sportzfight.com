/** A single pose landmark, matching MediaPipe's NormalizedLandmark. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/** Where in the movement the athlete currently is. */
export type RepPhase = 'idle' | 'up' | 'descending' | 'down' | 'ascending';

/** Actionable form problems, surfaced to the athlete mid-effort. */
export type FormIssue =
  | 'low_visibility'
  | 'not_horizontal'
  | 'hips_piked'
  | 'hips_sagging'
  | 'partial_rep'
  | 'too_fast';

export interface DetectorResult {
  /** Total valid reps this session. Monotonically non-decreasing. */
  count: number;
  phase: RepPhase;
  /**
   * PERSISTENT posture problems with the current frame: the body is not in a
   * position where reps can be counted. These drive the red/green tracking
   * indicator, because they describe a state the athlete must fix.
   */
  postureIssues: FormIssue[];
  /**
   * TRANSIENT notes about the rep that just ended (too shallow, too fast).
   * These fire on a single frame and must NOT colour the tracking indicator,
   * or a perfectly good plank flashes a warning on every rep.
   */
  repNotes: FormIssue[];
  /** Everything above, for callers that just want a flat list. */
  formFeedback: FormIssue[];
  /** 0..1 — how confident we are the body is being tracked properly. */
  confidence: number;
  /** 0..1 progress through the current rep, for the UI ring. */
  repProgress: number;
  /** True on the frame a rep was credited, so the UI can pop/vibrate. */
  justCounted: boolean;
  /**
   * Raw measured values for the current frame. Present only so /admin can show
   * what the detector actually sees while tuning thresholds against a real
   * camera; nothing in the battle UI should depend on it.
   */
  debug?: {
    elbowAngle: number;
    inclination: number;
    hipDeviation: number;
    meanVisibility: number;
    rangeOfMotion: number;
  };
}

/**
 * The contract every exercise implements.
 *
 * V1 ships pushups plus a manual fallback. Squats, sit-ups, burpees and
 * pull-ups can be added by writing one of these and registering it — the
 * battle UI, the score sync, and the security rules all stay untouched.
 */
export interface ExerciseDetector {
  readonly id: string;
  readonly label: string;
  /** Shown on the camera screen as setup guidance. */
  readonly setupHint: string;
  /** True if this detector consumes pose landmarks (vs. manual taps). */
  readonly usesCamera: boolean;

  reset(): void;
  /** Feed one frame. `landmarks` is null when no body was detected. */
  process(landmarks: Landmark[] | null, tMs: number): DetectorResult;
  /** Manual rep entry (tap fallback, or a correction). */
  tap?(delta: number): void;
}

/** Human-readable copy for each form issue. */
export const FORM_MESSAGES: Record<FormIssue, string> = {
  low_visibility: 'Recule — ton corps doit être entièrement visible',
  not_horizontal: 'Mets-toi en position de planche',
  hips_piked: 'Baisse les hanches — garde le corps droit',
  hips_sagging: 'Remonte les hanches — gaine-toi',
  partial_rep: 'Descends plus bas',
  too_fast: 'Trop rapide — contrôle le mouvement',
};

/** BlazePose 33-point topology indices used by the detectors. */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;
