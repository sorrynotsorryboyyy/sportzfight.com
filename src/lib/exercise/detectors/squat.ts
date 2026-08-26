import {
  Ema,
  Median3,
  allVisible,
  angleDeg,
  inclinationDeg,
  meanVisibility,
  midpoint,
  normalize,
  visibilityOf,
} from '../geometry';
import {
  LM,
  type DetectorResult,
  type ExerciseDetector,
  type FormIssue,
  type Landmark,
  type RepPhase,
} from '../types';

/**
 * Tuning for squat detection.
 *
 * Same shape as the pushup detector, and for the same reason: a single
 * knee-angle threshold is trivially fooled. Sitting on a chair and straightening
 * your legs produces a textbook knee-angle wave without a squat ever happening.
 * Four independent gates fix that.
 */
export const SQUAT_CONFIG = {
  // --- gate 1: four-threshold hysteresis on the knee angle (degrees) ---
  // Standing measures 168-178; a parallel squat bottoms around 80-95.
  UP_ENTER: 160,   // legs considered extended
  UP_EXIT: 150,    // must drop below this to start descending
  DOWN_ENTER: 100, // roughly thighs-parallel: real depth
  DOWN_EXIT: 115,  // must rise above this to start ascending

  // --- gate 2: range of motion within one rep ---
  MIN_ROM_DEG: 50,

  // --- gate 3: the body must be upright ---
  // Shoulder->hip line versus VERTICAL. A squat leans forward (hips back,
  // chest over the toes), so this is generous — but someone lying down or
  // sitting sideways to the camera is nowhere near it.
  MAX_TORSO_LEAN: 50,

  // --- gate 4: the hips must actually travel down ---
  // Fraction of leg length (hip->ankle). This is the gate that kills the
  // seated fake: bending your knees in a chair swings the knee angle without
  // the hips descending at all.
  MIN_HIP_DROP: 0.10,

  // --- timing ---
  MIN_REP_MS: 700,    // a full down+up faster than this is not a squat
  MAX_REP_MS: 12_000, // longer than this: abandon the rep
  MIN_DOWN_MS: 120,   // dwell at the bottom, kills the bounce
  DEBOUNCE_MS: 350,

  // --- visibility ---
  MIN_VISIBILITY: 0.6,
  MIN_MEAN_VISIBILITY: 0.7,
  GRACE_FRAMES: 8,    // ~250ms at 30fps before giving up on a tracked body
  POSTURE_GRACE_FRAMES: 5,

  SMOOTHING_ALPHA: 0.6,
} as const;

const LEG_CHAIN = [
  LM.LEFT_HIP, LM.RIGHT_HIP,
  LM.LEFT_KNEE, LM.RIGHT_KNEE,
  LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
] as const;

const TORSO_CHAIN = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER] as const;

/** Average an angle across both sides, tolerating one occluded limb. */
function bilateralAngle(
  lms: Landmark[],
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  minVis: number,
): number {
  const lOk = left.every((i) => visibilityOf(lms, i) >= minVis);
  const rOk = right.every((i) => visibilityOf(lms, i) >= minVis);

  const l = lOk ? angleDeg(lms[left[0]], lms[left[1]], lms[left[2]]) : Number.NaN;
  const r = rOk ? angleDeg(lms[right[0]], lms[right[1]], lms[right[2]]) : Number.NaN;

  if (Number.isFinite(l) && Number.isFinite(r)) return (l + r) / 2;
  if (Number.isFinite(l)) return l;
  if (Number.isFinite(r)) return r;
  return Number.NaN;
}

export class SquatDetector implements ExerciseDetector {
  readonly id = 'squats';
  readonly label = 'Squats';
  readonly setupHint =
    'Place ton téléphone de côté, à ~2 m, de la tête aux pieds.';
  readonly usesCamera = true;

  private kneeMed = new Median3();
  private kneeEma = new Ema(SQUAT_CONFIG.SMOOTHING_ALPHA);
  private leanEma = new Ema(SQUAT_CONFIG.SMOOTHING_ALPHA);

  private phase: RepPhase = 'idle';
  private autoCount = 0;
  private manualAdjust = 0;

  private repMinAngle = 180;
  private repMaxAngle = 0;
  /** Highest hip position (smallest y) seen since the rep began. */
  private repTopHipY = Number.POSITIVE_INFINITY;
  /** Lowest hip position (largest y) seen since the rep began. */
  private repBottomHipY = Number.NEGATIVE_INFINITY;
  private legLength = Number.NaN;

  private descentStartMs = 0;
  private downEnteredMs = 0;
  /**
   * When the legs were last unambiguously extended, i.e. at or above UP_ENTER.
   * The rep clock runs from here rather than from the UP_EXIT crossing: the
   * median and the EMA lag the body by several frames, and charging that lag
   * to the athlete rejects reps that really were slow enough.
   */
  private lastUprightMs = 0;
  private lastRepMs = -Infinity;
  private lowVisFrames = 0;
  private badPostureFrames = 0;
  private justCounted = false;

  /** Reps credited by the camera, before any manual correction. */
  get autoReps(): number {
    return this.autoCount;
  }
  get adjustment(): number {
    return this.manualAdjust;
  }

  reset(): void {
    this.kneeMed.reset();
    this.kneeEma.reset();
    this.leanEma.reset();
    this.phase = 'idle';
    this.autoCount = 0;
    this.manualAdjust = 0;
    this.resetRepRange(180);
    this.descentStartMs = 0;
    this.downEnteredMs = 0;
    this.lastUprightMs = 0;
    this.lastRepMs = -Infinity;
    this.lowVisFrames = 0;
    this.badPostureFrames = 0;
    this.justCounted = false;
  }

  /** Manual correction. The total is floored at zero. */
  tap(delta: number): void {
    this.manualAdjust += delta;
    if (this.total < 0) this.manualAdjust = -this.autoCount;
  }

  private get total(): number {
    return this.autoCount + this.manualAdjust;
  }

  private result(
    phase: RepPhase,
    postureIssues: FormIssue[],
    confidence: number,
    repProgress: number,
    repNotes: FormIssue[] = [],
    debug?: DetectorResult['debug'],
  ): DetectorResult {
    const r: DetectorResult = {
      count: Math.max(0, this.total),
      phase,
      postureIssues,
      repNotes,
      formFeedback: [...postureIssues, ...repNotes],
      confidence,
      repProgress,
      justCounted: this.justCounted,
      debug,
    };
    this.justCounted = false;
    return r;
  }

  process(landmarks: Landmark[] | null, tMs: number): DetectorResult {
    // ---- no body at all ----
    if (!landmarks || landmarks.length < 29) {
      this.lowVisFrames++;
      if (this.lowVisFrames > SQUAT_CONFIG.GRACE_FRAMES) {
        this.phase = 'idle';
        this.kneeMed.reset();
        this.kneeEma.reset();
      }
      return this.result('idle', ['low_visibility'], 0, 0);
    }

    // ---- gate 0: is the body visible enough to judge? ----
    const legsVisible = allVisible(landmarks, LEG_CHAIN, SQUAT_CONFIG.MIN_VISIBILITY);
    const meanVis = meanVisibility(landmarks, [...LEG_CHAIN, ...TORSO_CHAIN]);

    if (!legsVisible || meanVis < SQUAT_CONFIG.MIN_MEAN_VISIBILITY) {
      this.lowVisFrames++;
      // A brief occlusion must not destroy a rep in progress.
      if (this.lowVisFrames > SQUAT_CONFIG.GRACE_FRAMES) {
        this.phase = 'idle';
        this.kneeMed.reset();
        this.kneeEma.reset();
        return this.result('idle', ['low_visibility'], meanVis, 0);
      }
      return this.result(this.phase, ['low_visibility'], meanVis, 0);
    }
    this.lowVisFrames = 0;

    // ---- signals ----
    const knee = this.kneeEma.push(
      this.kneeMed.push(
        bilateralAngle(
          landmarks,
          [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
          [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
          SQUAT_CONFIG.MIN_VISIBILITY,
        ),
      ),
    );

    const shoulderMid = midpoint(
      landmarks[LM.LEFT_SHOULDER],
      landmarks[LM.RIGHT_SHOULDER],
    );
    const hipMid = midpoint(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP]);
    const ankleMid = midpoint(landmarks[LM.LEFT_ANKLE], landmarks[LM.RIGHT_ANKLE]);

    // inclinationDeg returns the angle from HORIZONTAL; an upright torso is
    // near 90, so the lean away from vertical is its complement.
    const lean = this.leanEma.push(90 - inclinationDeg(shoulderMid, hipMid));

    // Leg length normalises the hip drop, so the gate holds whatever the
    // athlete's distance from the camera.
    const legLen = Math.abs(ankleMid.y - hipMid.y);
    if (Number.isFinite(legLen) && legLen > 0.05) this.legLength = legLen;

    if (!Number.isFinite(knee)) {
      return this.result(this.phase, ['low_visibility'], meanVis, 0);
    }

    // ---- form evaluation ----
    const posture: FormIssue[] = [];
    const repNotes: FormIssue[] = [];

    const upright =
      !Number.isFinite(lean) || Math.abs(lean) <= SQUAT_CONFIG.MAX_TORSO_LEAN;
    if (!upright) posture.push('not_horizontal');

    const formValid = upright;

    // ---- track the rep envelope ----
    this.repMinAngle = Math.min(this.repMinAngle, knee);
    this.repMaxAngle = Math.max(this.repMaxAngle, knee);
    this.repTopHipY = Math.min(this.repTopHipY, hipMid.y);
    this.repBottomHipY = Math.max(this.repBottomHipY, hipMid.y);

    switch (this.phase) {
      case 'idle':
        // Only enter the cycle from a clean standing position.
        if (knee >= SQUAT_CONFIG.UP_ENTER && formValid) {
          this.phase = 'up';
          this.lastUprightMs = tMs;
          this.resetRepRange(knee, hipMid.y);
        }
        break;

      case 'up':
        if (knee < SQUAT_CONFIG.UP_EXIT) {
          this.phase = 'descending';
          // The descent began when the legs left full extension, not when the
          // smoothed angle finally crossed UP_EXIT: the median and the EMA lag
          // the body by several frames, and charging that lag to the athlete
          // would reject reps that really were slow enough.
          this.descentStartMs = this.lastUprightMs || tMs;
          // The envelope is NOT reset here. The frames between full extension
          // and this crossing belong to the rep, and discarding them would
          // shrink both the range of motion and the hip drop below what the
          // athlete actually produced.
        } else if (knee >= SQUAT_CONFIG.UP_ENTER) {
          this.lastUprightMs = tMs;
          this.resetRepRange(knee, hipMid.y);
        }
        break;

      case 'descending':
        if (knee <= SQUAT_CONFIG.DOWN_ENTER) {
          this.phase = 'down';
          this.downEnteredMs = tMs;
        } else if (knee >= SQUAT_CONFIG.UP_ENTER) {
          // Came back up without reaching depth: not a rep.
          this.phase = 'up';
          repNotes.push('partial_rep');
          this.resetRepRange(knee, hipMid.y);
        } else if (tMs - this.descentStartMs > SQUAT_CONFIG.MAX_REP_MS) {
          this.phase = 'idle';
        }
        break;

      case 'down':
        if (knee > SQUAT_CONFIG.DOWN_EXIT) {
          if (tMs - this.downEnteredMs < SQUAT_CONFIG.MIN_DOWN_MS) {
            repNotes.push('too_fast');
          }
          this.phase = 'ascending';
        } else if (tMs - this.downEnteredMs > SQUAT_CONFIG.MAX_REP_MS) {
          this.phase = 'idle';
        }
        break;

      case 'ascending':
        if (knee >= SQUAT_CONFIG.UP_ENTER) {
          this.tryCredit(tMs, formValid, repNotes);
          this.phase = 'up';
          this.lastUprightMs = tMs;
          this.resetRepRange(knee, hipMid.y);
        } else if (knee <= SQUAT_CONFIG.DOWN_ENTER) {
          this.phase = 'down'; // sank back down
          this.downEnteredMs = tMs;
        } else if (tMs - this.descentStartMs > SQUAT_CONFIG.MAX_REP_MS) {
          this.phase = 'idle';
        }
        break;
    }

    // Progress through the current rep, for the UI ring.
    const span = SQUAT_CONFIG.UP_ENTER - SQUAT_CONFIG.DOWN_ENTER;
    const progress =
      this.phase === 'descending' || this.phase === 'down'
        ? normalize(SQUAT_CONFIG.UP_ENTER - knee, 0, span) * 0.5
        : this.phase === 'ascending'
          ? 0.5 + normalize(knee - SQUAT_CONFIG.DOWN_ENTER, 0, span) * 0.5
          : 0;

    // Hold a posture fault for a few frames before surfacing it, so one noisy
    // landmark cannot flash a warning during an otherwise clean rep.
    this.badPostureFrames = posture.length ? this.badPostureFrames + 1 : 0;
    const reportedPosture =
      this.badPostureFrames >= SQUAT_CONFIG.POSTURE_GRACE_FRAMES ? posture : [];

    const confidence = Math.min(meanVis, formValid ? 1 : 0.45);
    return this.result(this.phase, reportedPosture, confidence, progress, repNotes, {
      elbowAngle: knee, // the primary joint angle, whatever the exercise
      inclination: lean,
      hipDeviation: this.hipDrop(),
      meanVisibility: meanVis,
      rangeOfMotion: this.repMaxAngle - this.repMinAngle,
    });
  }

  /** How far the hips travelled this rep, as a fraction of leg length. */
  private hipDrop(): number {
    if (!Number.isFinite(this.legLength) || this.legLength <= 0) return Number.NaN;
    if (!Number.isFinite(this.repTopHipY) || !Number.isFinite(this.repBottomHipY)) {
      return Number.NaN;
    }
    return (this.repBottomHipY - this.repTopHipY) / this.legLength;
  }

  private resetRepRange(knee: number, hipY?: number): void {
    this.repMinAngle = knee;
    this.repMaxAngle = knee;
    this.repTopHipY = hipY ?? Number.POSITIVE_INFINITY;
    this.repBottomHipY = hipY ?? Number.NEGATIVE_INFINITY;
  }

  /** Final arbitration: credit the rep only if every gate agreed. */
  private tryCredit(tMs: number, formValid: boolean, repNotes: FormIssue[]): void {
    const cycleMs = tMs - this.descentStartMs;
    const rom = this.repMaxAngle - this.repMinAngle;
    const drop = this.hipDrop();

    if (!formValid) return;
    if (tMs - this.lastRepMs < SQUAT_CONFIG.DEBOUNCE_MS) return;
    if (cycleMs < SQUAT_CONFIG.MIN_REP_MS) {
      repNotes.push('too_fast');
      return;
    }
    if (rom < SQUAT_CONFIG.MIN_ROM_DEG) {
      repNotes.push('partial_rep');
      return;
    }
    // The gate that rejects a seated fake: knees can bend all they like, but
    // if the hips never travelled down, no squat happened.
    if (!Number.isFinite(drop) || drop < SQUAT_CONFIG.MIN_HIP_DROP) {
      repNotes.push('partial_rep');
      return;
    }

    this.autoCount++;
    this.lastRepMs = tMs;
    this.justCounted = true;
  }
}

export const createSquatDetector = (): ExerciseDetector => new SquatDetector();
