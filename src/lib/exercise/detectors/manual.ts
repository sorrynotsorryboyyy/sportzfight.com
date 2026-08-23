import type {
  DetectorResult,
  ExerciseDetector,
  Landmark,
} from '../types';

/**
 * Tap-to-count fallback.
 *
 * Implements the same interface as the camera detectors, so the battle screen,
 * the score sync and the security rules all work unchanged when the camera is
 * denied, unavailable, or the athlete simply prefers to count manually.
 */
export class ManualDetector implements ExerciseDetector {
  readonly usesCamera = false;
  readonly setupHint = 'Appuie sur le bouton à chaque répétition.';

  private count = 0;
  private justCounted = false;

  constructor(
    readonly id: string,
    readonly label: string,
  ) {}

  /** Every rep here is a manual entry — there is no camera contribution. */
  get autoReps(): number {
    return 0;
  }
  get adjustment(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.justCounted = false;
  }

  tap(delta = 1): void {
    this.count = Math.max(0, this.count + delta);
    if (delta > 0) this.justCounted = true;
  }

  process(_landmarks: Landmark[] | null, _tMs: number): DetectorResult {
    const r: DetectorResult = {
      count: this.count,
      phase: 'idle',
      formFeedback: [],
      confidence: 1,
      repProgress: 0,
      justCounted: this.justCounted,
    };
    this.justCounted = false;
    return r;
  }
}

export const createManualDetector = (id = 'pushups', label = 'Pompes'): ExerciseDetector =>
  new ManualDetector(id, label);
