import { describe, expect, it } from 'vitest';
import { SquatDetector, SQUAT_CONFIG } from '../src/lib/exercise/detectors/squat';
import { LM, type Landmark } from '../src/lib/exercise/types';

/**
 * Synthesises pose frames so squat counting can be tested without a camera.
 *
 * The athlete stands facing the camera side-on: shoulders at the top, hips
 * below, knees, ankles on the floor. Bending is produced by lowering the hip
 * and pushing the knee forward, which is what actually happens in a squat and
 * gives exact control of the knee angle.
 */

const V = 0.95; // healthy visibility

function lm(x: number, y: number, visibility = V): Landmark {
  return { x, y, z: 0, visibility };
}

interface FrameOpts {
  /** Target knee angle (hip-knee-ankle) in degrees. Standing ~175. */
  kneeAngle: number;
  /** Torso lean away from vertical, degrees. A real squat leans forward a bit. */
  lean?: number;
  /**
   * Override the hip height directly, as a fraction of leg length below the
   * standing position. Used to fake "knees bend but the body never descends".
   */
  hipDropOverride?: number;
  visibility?: number;
}

const ANKLE_Y = 0.95;
const STANDING_HIP_Y = 0.45;
const LEG = ANKLE_Y - STANDING_HIP_Y; // 0.5

function frame({
  kneeAngle,
  lean = 10,
  hipDropOverride,
  visibility = V,
}: FrameOpts): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 33 }, () => lm(0, 0, 0));
  const rad = (d: number) => (d * Math.PI) / 180;

  // Thigh and shin are half the leg each.
  const seg = LEG / 2;

  // A smaller knee angle means a deeper squat: the hip drops and the knee
  // travels forward. Derive the hip height from the angle unless overridden.
  const half = rad(kneeAngle) / 2;
  // With two equal segments, hip-to-ankle distance = 2 * seg * sin(angle/2).
  const hipToAnkle = 2 * seg * Math.sin(half);
  const hipY =
    hipDropOverride === undefined
      ? ANKLE_Y - hipToAnkle
      : STANDING_HIP_Y + hipDropOverride * LEG;

  const ankleX = 0.5;
  const hipX = 0.5;

  // Place the knee so the hip-knee-ankle angle matches the request.
  const midY = (hipY + ANKLE_Y) / 2;
  const halfSpan = Math.abs(ANKLE_Y - hipY) / 2;
  const kneeOut = Math.sqrt(Math.max(0, seg * seg - halfSpan * halfSpan));
  const kneeX = ankleX + kneeOut;

  // Shoulders sit a torso-length above the hip, tilted by `lean`.
  const torso = 0.3;
  const shoulderX = hipX + Math.sin(rad(lean)) * torso;
  const shoulderY = hipY - Math.cos(rad(lean)) * torso;

  const set = (i: number, x: number, y: number, vis = visibility) => {
    pts[i] = lm(x, y, vis);
  };

  set(LM.LEFT_SHOULDER, shoulderX, shoulderY);
  set(LM.RIGHT_SHOULDER, shoulderX, shoulderY);
  set(LM.LEFT_HIP, hipX, hipY);
  set(LM.RIGHT_HIP, hipX, hipY);
  set(LM.LEFT_KNEE, kneeX, midY);
  set(LM.RIGHT_KNEE, kneeX, midY);
  set(LM.LEFT_ANKLE, ankleX, ANKLE_Y);
  set(LM.RIGHT_ANKLE, ankleX, ANKLE_Y);

  return pts;
}

/** Sanity-check that the harness really encodes the angle we asked for. */
describe('test harness', () => {
  it('produces roughly the requested knee angle', async () => {
    const { angleDeg } = await import('../src/lib/exercise/geometry');
    for (const want of [90, 120, 170]) {
      const f = frame({ kneeAngle: want });
      const got = angleDeg(f[LM.LEFT_HIP], f[LM.LEFT_KNEE], f[LM.LEFT_ANKLE]);
      expect(Math.abs(got - want)).toBeLessThan(6);
    }
  });

  it('drops the hip as the squat deepens', () => {
    const standing = frame({ kneeAngle: 175 })[LM.LEFT_HIP].y;
    const deep = frame({ kneeAngle: 90 })[LM.LEFT_HIP].y;
    expect(deep).toBeGreaterThan(standing); // +y is downward
  });
});

/** Drive a full rep: settle standing, descend, hold, rise. */
function doRep(
  det: SquatDetector,
  t: { ms: number },
  opts: Partial<FrameOpts> & { bottom?: number; holdMs?: number; stepMs?: number } = {},
) {
  const { bottom = 90, holdMs = 200, stepMs = 33, ...form } = opts;
  const step = (angle: number) => {
    det.process(frame({ kneeAngle: angle, ...form }), t.ms);
    t.ms += stepMs;
  };

  for (let i = 0; i < 5; i++) step(175);
  for (let a = 175; a >= bottom; a -= 10) step(a);
  for (let h = 0; h < Math.ceil(holdMs / stepMs); h++) step(bottom);
  for (let a = bottom; a <= 175; a += 10) step(a);
  step(176);
}

describe('squat counting — happy path', () => {
  it('counts a single clean rep', () => {
    const det = new SquatDetector();
    doRep(det, { ms: 1000 });
    expect(det.autoReps).toBe(1);
  });

  it('counts ten reps as ten', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 10; i++) doRep(det, t);
    expect(det.autoReps).toBe(10);
  });

  it('reports justCounted exactly once per rep', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    let credited = 0;
    const step = (angle: number) => {
      const r = det.process(frame({ kneeAngle: angle }), t.ms);
      if (r.justCounted) credited++;
      t.ms += 33;
    };
    for (let i = 0; i < 5; i++) step(175);
    for (let a = 175; a >= 90; a -= 10) step(a);
    for (let i = 0; i < 7; i++) step(90);
    for (let a = 90; a <= 175; a += 10) step(a);
    step(176);
    expect(credited).toBe(1);
  });

  it('tolerates the forward lean of a real squat', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 3; i++) doRep(det, t, { lean: 35 });
    expect(det.autoReps).toBe(3);
  });
});

describe('squat counting — the cheat gates', () => {
  it('REJECTS bending the knees while seated', () => {
    // The signature fake: a perfect knee-angle wave with the hips going
    // nowhere. This is the squat equivalent of arm curls in a chair.
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { hipDropOverride: 0 });
    expect(det.autoReps).toBe(0);
  });

  it('REJECTS a hip drop too small to be a squat', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { hipDropOverride: 0.03 });
    expect(det.autoReps).toBe(0);
  });

  it('REJECTS partial reps that never reach depth', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { bottom: 130 });
    expect(det.autoReps).toBe(0);
  });

  it('REJECTS a frantic bounce faster than a real rep', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { stepMs: 8, holdMs: 8 });
    expect(det.autoReps).toBe(0);
  });

  it('REJECTS a body lying down rather than standing', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { lean: 85 });
    expect(det.autoReps).toBe(0);
  });

  it('does not count while the body is barely visible', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { visibility: 0.2 });
    expect(det.autoReps).toBe(0);
  });

  it('does not double-count jitter around the standing threshold', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    doRep(det, t);
    expect(det.autoReps).toBe(1);
    for (let i = 0; i < 60; i++) {
      det.process(frame({ kneeAngle: i % 2 ? 158 : 163 }), t.ms);
      t.ms += 33;
    }
    expect(det.autoReps).toBe(1);
  });

  it('does not count micro-oscillation between the exit thresholds', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) {
      det.process(frame({ kneeAngle: 175 }), t.ms);
      t.ms += 33;
    }
    for (let i = 0; i < 120; i++) {
      det.process(frame({ kneeAngle: i % 2 ? 117 : 148 }), t.ms);
      t.ms += 33;
    }
    expect(det.autoReps).toBe(0);
  });
});

describe('resilience', () => {
  it('survives a brief occlusion mid-rep', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    const step = (angle: number, vis = V) => {
      det.process(frame({ kneeAngle: angle, visibility: vis }), t.ms);
      t.ms += 33;
    };
    for (let i = 0; i < 5; i++) step(175);
    for (let a = 175; a >= 90; a -= 10) step(a);
    step(90, 0.1);
    step(90, 0.1);
    for (let i = 0; i < 5; i++) step(90);
    for (let a = 90; a <= 175; a += 10) step(a);
    step(176);
    expect(det.autoReps).toBe(1);
  });

  it('handles a null frame without throwing', () => {
    const det = new SquatDetector();
    const r = det.process(null, 1000);
    expect(r.count).toBe(0);
    expect(r.postureIssues).toContain('low_visibility');
  });

  it('reports the accumulated count when polled with a null frame', () => {
    // useExerciseSession.finalize() polls this way; it must not lose the count.
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 3; i++) doRep(det, t);
    expect(det.process(null, t.ms).count).toBe(3);
    expect(det.autoReps).toBe(3);
  });
});

describe('manual correction', () => {
  it('applies +1 and -1 to the reported total', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    doRep(det, t);
    det.tap(+1);
    expect(det.process(null, t.ms).count).toBe(2);
    det.tap(-1);
    expect(det.process(null, t.ms).count).toBe(1);
  });

  it('never lets the total go negative', () => {
    const det = new SquatDetector();
    det.tap(-5);
    expect(det.process(null, 1000).count).toBe(0);
  });

  it('keeps autoReps and the adjustment separable for provenance', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    doRep(det, t);
    doRep(det, t);
    det.tap(+3);
    // The rules assert autoReps + manualAdjust === score.
    expect(det.autoReps + det.adjustment).toBe(5);
  });
});

describe('config sanity', () => {
  it('keeps hysteresis dead zones on both ends', () => {
    expect(SQUAT_CONFIG.UP_EXIT).toBeLessThan(SQUAT_CONFIG.UP_ENTER);
    expect(SQUAT_CONFIG.DOWN_EXIT).toBeGreaterThan(SQUAT_CONFIG.DOWN_ENTER);
    expect(SQUAT_CONFIG.DOWN_EXIT).toBeLessThan(SQUAT_CONFIG.UP_EXIT);
  });
});
