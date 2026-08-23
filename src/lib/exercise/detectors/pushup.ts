import {
  Ema,
  Median3,
  allVisible,
  angleDeg,
  inclinationDeg,
  meanVisibility,
  midpoint,
  normalize,
  signedOffset,
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
 * Tuning for pushup detection.
 *
 * The numbers matter more than the structure here: a naive "elbow angle
 * crosses a threshold" counter double-counts on jitter and is trivially fooled
 * by waving your arms while seated. Four independent gates fix that.
 */
export const PUSHUP_CONFIG = {
  // --- gate 1: four-threshold hysteresis on elbow angle (degrees) ---
  // Entering a state needs a decisive angle; LEAVING it needs a different,
  // slacker one. The dead zones absorb landmark noise, which is the single
  // biggest cause of phantom reps.
  UP_ENTER: 160,   // arms extended
  UP_EXIT: 150,    // must drop below this to begin descending
  DOWN_ENTER: 95,  // roughly parallel forearms: real depth
  DOWN_EXIT: 110,  // must rise above this to begin ascending

  // --- gate 2: range of motion within one rep ---
  MIN_ROM_DEG: 55,

  // --- gate 3: torso straightness ---
  // Measured as the hip's signed offset from the shoulder->ankle line, as a
  // fraction of body length. An unsigned joint angle cannot distinguish a
  // sagging back from a piked one (acos only returns 0..180), so the sign is
  // what tells the two faults apart.
  MAX_TORSO_DEVIATION: 0.11,  // ~11% of body length off the straight line
  // Retained as a coarse secondary check for a badly broken pose.
  TORSO_MIN: 140,

  // --- gate 4: body horizontality, shoulder->ankle vs horizontal ---
  // A seated person doing arm curls produces a perfect elbow sine wave but
  // sits near 85 degrees. This is what makes that impossible to pass.
  MAX_INCLINATION: 35,

  // --- timing ---
  MIN_REP_MS: 600,    // full down+up; world-record cadence is ~500ms
  MAX_REP_MS: 10_000, // abandon a rep that stalls
  MIN_DOWN_MS: 150,   // dwell at the bottom: kills the bounce
  DEBOUNCE_MS: 350,

  // --- visibility ---
  MIN_VISIBILITY: 0.6,
  MIN_MEAN_VISIBILITY: 0.7,
  GRACE_FRAMES: 8,    // ~250ms at 30fps before giving up on a tracked body

  // A median-of-3 removes spikes with no lag; the EMA then only has to take
  // the edge off, so it can be light. A heavy EMA would lag the lockout and
  // swallow reps from an athlete who extends to just barely UP_ENTER.
  SMOOTHING_ALPHA: 0.6,
} as const;

const ARM_CHAIN = [
  LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
  LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
  LM.LEFT_WRIST, LM.RIGHT_WRIST,
] as const;

const CORE_CHAIN = [LM.LEFT_HIP, LM.RIGHT_HIP] as const;

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

export class PushupDetector implements ExerciseDetector {
  readonly id = 'pushups';
  readonly label = 'Pompes';
  readonly setupHint =
    'Pose ton téléphone au sol, de côté, à ~2 m. Tout ton corps doit être visible.';
  readonly usesCamera = true;

  private elbowMed = new Median3();
  private elbowEma = new Ema(PUSHUP_CONFIG.SMOOTHING_ALPHA);
  private torsoEma = new Ema(PUSHUP_CONFIG.SMOOTHING_ALPHA);
  private inclineEma = new Ema(PUSHUP_CONFIG.SMOOTHING_ALPHA);

  private phase: RepPhase = 'idle';
  private autoCount = 0;
  private manualAdjust = 0;

  private repMinAngle = 180;
  private repMaxAngle = 0;
  private descentStartMs = 0;
  private downEnteredMs = 0;
  private lastRepMs = -Infinity;
  private lowVisFrames = 0;
  private justCounted = false;

  /** Reps credited by the camera, before any manual correction. */
  get autoReps(): number {
    return this.autoCount;
  }
  get adjustment(): number {
    return this.manualAdjust;
  }

  reset(): void {
    this.elbowMed.reset();
    this.elbowEma.reset();
    this.torsoEma.reset();
    this.inclineEma.reset();
    this.phase = 'idle';
    this.autoCount = 0;
    this.manualAdjust = 0;
    this.repMinAngle = 180;
    this.repMaxAngle = 0;
    this.descentStartMs = 0;
    this.downEnteredMs = 0;
    this.lastRepMs = -Infinity;
    this.lowVisFrames = 0;
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
    feedback: FormIssue[],
    confidence: number,
    repProgress: number,
  ): DetectorResult {
    const r: DetectorResult = {
      count: Math.max(0, this.total),
      phase,
      formFeedback: feedback,
      confidence,
      repProgress,
      justCounted: this.justCounted,
    };
    this.justCounted = false;
    return r;
  }

  process(landmarks: Landmark[] | null, tMs: number): DetectorResult {
    // ---- no body at all ----
    if (!landmarks || landmarks.length < 29) {
      this.lowVisFrames++;
      if (this.lowVisFrames > PUSHUP_CONFIG.GRACE_FRAMES) {
        this.phase = 'idle';
        this.elbowMed.reset();
        this.elbowEma.reset();
      }
      return this.result('idle', ['low_visibility'], 0, 0);
    }

    // ---- gate 0: is the body actually visible enough to judge? ----
    const armsVisible = allVisible(landmarks, ARM_CHAIN, PUSHUP_CONFIG.MIN_VISIBILITY);
    const meanVis = meanVisibility(landmarks, [...ARM_CHAIN, ...CORE_CHAIN]);

    if (!armsVisible || meanVis < PUSHUP_CONFIG.MIN_MEAN_VISIBILITY) {
      this.lowVisFrames++;
      // A brief occlusion must not destroy a rep in progress, hence the grace.
      if (this.lowVisFrames > PUSHUP_CONFIG.GRACE_FRAMES) {
        this.phase = 'idle';
        this.elbowMed.reset();
        this.elbowEma.reset();
        return this.result('idle', ['low_visibility'], meanVis, 0);
      }
      return this.result(this.phase, ['low_visibility'], meanVis, 0);
    }
    this.lowVisFrames = 0;

    // ---- signals ----
    const elbow = this.elbowEma.push(
      this.elbowMed.push(
        bilateralAngle(
          landmarks,
          [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
          [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
          PUSHUP_CONFIG.MIN_VISIBILITY,
        ),
      ),
    );

    const torsoAngle = bilateralAngle(
      landmarks,
      [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE],
      [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE],
      PUSHUP_CONFIG.MIN_VISIBILITY,
    );

    const shoulderMid = midpoint(
      landmarks[LM.LEFT_SHOULDER],
      landmarks[LM.RIGHT_SHOULDER],
    );
    // Prefer ankles; fall back to hips when the feet are out of frame, which
    // is common on a phone propped close to the athlete.
    const ankleVis = Math.min(
      visibilityOf(landmarks, LM.LEFT_ANKLE),
      visibilityOf(landmarks, LM.RIGHT_ANKLE),
    );
    const lowerMid =
      ankleVis >= PUSHUP_CONFIG.MIN_VISIBILITY
        ? midpoint(landmarks[LM.LEFT_ANKLE], landmarks[LM.RIGHT_ANKLE])
        : midpoint(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP]);

    const incline = this.inclineEma.push(inclinationDeg(shoulderMid, lowerMid));

    // Signed hip deviation from the shoulder->ankle line, as a fraction of
    // body length. Image space puts +y downward, and the 2D cross product
    // comes out NEGATIVE when the hip sits below that line, so it is negated
    // here to give the intuitive convention: positive = sagging toward the
    // floor, negative = piked up.
    const hipMid = midpoint(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP]);
    const hipDev = this.torsoEma.push(
      -signedOffset(shoulderMid, lowerMid, hipMid),
    );

    if (!Number.isFinite(elbow)) {
      return this.result(this.phase, ['low_visibility'], meanVis, 0);
    }

    // ---- form evaluation ----
    const feedback: FormIssue[] = [];
    const horizontal =
      !Number.isFinite(incline) || incline <= PUSHUP_CONFIG.MAX_INCLINATION;
    if (!horizontal) feedback.push('not_horizontal');

    let torsoOk = true;
    if (Number.isFinite(hipDev)) {
      if (hipDev > PUSHUP_CONFIG.MAX_TORSO_DEVIATION) {
        feedback.push('hips_sagging');
        torsoOk = false;
      } else if (hipDev < -PUSHUP_CONFIG.MAX_TORSO_DEVIATION) {
        feedback.push('hips_piked');
        torsoOk = false;
      }
    }
    // Coarse backstop: a hip angle this sharp is a collapsed pose regardless
    // of which way it bent.
    if (Number.isFinite(torsoAngle) && torsoAngle < PUSHUP_CONFIG.TORSO_MIN) {
      if (!feedback.includes('hips_piked')) feedback.push('hips_piked');
      torsoOk = false;
    }

    // A rep only counts when the body is genuinely in a plank. This is the
    // gate that rejects seated fake reps outright.
    const formValid = horizontal && torsoOk;

    // ---- state machine over the smoothed elbow angle ----
    this.repMinAngle = Math.min(this.repMinAngle, elbow);
    this.repMaxAngle = Math.max(this.repMaxAngle, elbow);

    switch (this.phase) {
      case 'idle':
        // Only enter the cycle from a clean locked-out plank.
        if (elbow >= PUSHUP_CONFIG.UP_ENTER && formValid) {
          this.phase = 'up';
          this.resetRepRange(elbow);
        }
        break;

      case 'up':
        if (elbow < PUSHUP_CONFIG.UP_EXIT) {
          this.phase = 'descending';
          this.descentStartMs = tMs;
          this.resetRepRange(elbow);
        }
        break;

      case 'descending':
        if (elbow <= PUSHUP_CONFIG.DOWN_ENTER) {
          this.phase = 'down';
          this.downEnteredMs = tMs;
        } else if (elbow >= PUSHUP_CONFIG.UP_ENTER) {
          // Came back up without reaching depth: not a rep.
          this.phase = 'up';
          feedback.push('partial_rep');
          this.resetRepRange(elbow);
        } else if (tMs - this.descentStartMs > PUSHUP_CONFIG.MAX_REP_MS) {
          this.phase = 'idle';
        }
        break;

      case 'down':
        if (elbow > PUSHUP_CONFIG.DOWN_EXIT) {
          if (tMs - this.downEnteredMs < PUSHUP_CONFIG.MIN_DOWN_MS) {
            // Bounced straight off the bottom.
            this.phase = 'ascending';
            feedback.push('too_fast');
          } else {
            this.phase = 'ascending';
          }
        } else if (tMs - this.downEnteredMs > PUSHUP_CONFIG.MAX_REP_MS) {
          this.phase = 'idle';
        }
        break;

      case 'ascending':
        if (elbow >= PUSHUP_CONFIG.UP_ENTER) {
          this.tryCredit(tMs, formValid, feedback);
          this.phase = 'up';
          this.resetRepRange(elbow);
        } else if (elbow <= PUSHUP_CONFIG.DOWN_ENTER) {
          this.phase = 'down';        // sank back down
          this.downEnteredMs = tMs;
        } else if (tMs - this.descentStartMs > PUSHUP_CONFIG.MAX_REP_MS) {
          this.phase = 'idle';
        }
        break;
    }

    // Progress through the current rep, for the UI ring.
    const progress =
      this.phase === 'descending' || this.phase === 'down'
        ? normalize(
            PUSHUP_CONFIG.UP_ENTER - elbow,
            0,
            PUSHUP_CONFIG.UP_ENTER - PUSHUP_CONFIG.DOWN_ENTER,
          ) * 0.5
        : this.phase === 'ascending'
          ? 0.5 +
            normalize(
              elbow - PUSHUP_CONFIG.DOWN_ENTER,
              0,
              PUSHUP_CONFIG.UP_ENTER - PUSHUP_CONFIG.DOWN_ENTER,
            ) * 0.5
          : 0;

    const confidence = Math.min(meanVis, formValid ? 1 : 0.45);
    return this.result(this.phase, feedback, confidence, progress);
  }

  private resetRepRange(elbow: number): void {
    this.repMinAngle = elbow;
    this.repMaxAngle = elbow;
  }

  /** Final arbitration: credit the rep only if every gate agreed. */
  private tryCredit(tMs: number, formValid: boolean, feedback: FormIssue[]): void {
    const cycleMs = tMs - this.descentStartMs;
    const rom = this.repMaxAngle - this.repMinAngle;

    if (!formValid) return;
    if (tMs - this.lastRepMs < PUSHUP_CONFIG.DEBOUNCE_MS) return;
    if (cycleMs < PUSHUP_CONFIG.MIN_REP_MS) {
      feedback.push('too_fast');
      return;
    }
    if (rom < PUSHUP_CONFIG.MIN_ROM_DEG) {
      feedback.push('partial_rep');
      return;
    }

    this.autoCount++;
    this.lastRepMs = tMs;
    this.justCounted = true;
  }
}

export const createPushupDetector = (): ExerciseDetector => new PushupDetector();
