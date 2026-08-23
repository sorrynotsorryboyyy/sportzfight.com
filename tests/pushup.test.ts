import { describe, expect, it } from 'vitest';
import { PushupDetector, PUSHUP_CONFIG } from '../src/lib/exercise/detectors/pushup';
import { LM, type Landmark } from '../src/lib/exercise/types';

/**
 * Synthesises pose frames so the counting logic can be tested without a camera.
 *
 * The athlete lies along the x axis (a plank seen from the side). The elbow
 * angle is produced by placing the wrist on a circle around the elbow, which
 * gives us exact control of the primary signal.
 */

const V = 0.95; // healthy visibility

function lm(x: number, y: number, visibility = V): Landmark {
  return { x, y, z: 0, visibility };
}

interface FrameOpts {
  elbowAngle: number;
  /** Angle at the hip (shoulder-hip-knee). 178 is a rigid plank. */
  torsoAngle?: number;
  /**
   * Perpendicular displacement of the hip from the shoulder->ankle line, as a
   * fraction of body length. Positive sags toward the floor, negative pikes
   * the hips up. This is what the detector actually measures.
   */
  hipOffset?: number;
  /** Inclination of the body vs horizontal, in degrees. */
  inclination?: number;
  visibility?: number;
  anklesVisible?: boolean;
}

function frame({
  elbowAngle,
  torsoAngle = 178,
  hipOffset = 0,
  inclination = 5,
  visibility = V,
  anklesVisible = true,
}: FrameOpts): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 33 }, () => lm(0, 0, 0));

  const rad = (d: number) => (d * Math.PI) / 180;
  const incl = rad(inclination);

  // Body axis: shoulder at origin, feet out along +x, tilted by `inclination`.
  const along = (d: number): [number, number] => [
    d * Math.cos(incl),
    d * Math.sin(incl),
  ];

  const [sx, sy] = [0, 0];
  const [hx0, hy0] = along(0.35);
  // Displace the hip perpendicular to the body axis. The axis direction is
  // (cos incl, sin incl), so its normal is (-sin incl, cos incl).
  const bodyLen = 0.85;
  const hx = hx0 + -Math.sin(incl) * hipOffset * bodyLen;
  const hy = hy0 + Math.cos(incl) * hipOffset * bodyLen;
  const [kx, ky] = along(0.6);
  const [ax, ay] = along(0.85);

  // Elbow sits below the shoulder (toward the floor, +y in image space).
  const ex = sx + 0.02;
  const ey = sy + 0.12;

  // Place the wrist so that angle(shoulder, elbow, wrist) == elbowAngle.
  // Vector elbow->shoulder, rotated by the desired angle, gives elbow->wrist.
  const vsx = sx - ex;
  const vsy = sy - ey;
  const base = Math.atan2(vsy, vsx);
  const target = base - rad(elbowAngle);
  const armLen = 0.13;
  const wx = ex + armLen * Math.cos(target);
  const wy = ey + armLen * Math.sin(target);

  // Knee placed to realise the requested hip angle, measured shoulder-hip-knee.
  const vhs = Math.atan2(sy - hy, sx - hx);
  const kAng = vhs - rad(torsoAngle);
  const legLen = 0.25;
  const kx2 = hx + legLen * Math.cos(kAng);
  const ky2 = hy + legLen * Math.sin(kAng);

  const set = (i: number, x: number, y: number, vis = visibility) => {
    pts[i] = lm(x, y, vis);
  };

  set(LM.LEFT_SHOULDER, sx, sy);
  set(LM.RIGHT_SHOULDER, sx, sy);
  set(LM.LEFT_ELBOW, ex, ey);
  set(LM.RIGHT_ELBOW, ex, ey);
  set(LM.LEFT_WRIST, wx, wy);
  set(LM.RIGHT_WRIST, wx, wy);
  set(LM.LEFT_HIP, hx, hy);
  set(LM.RIGHT_HIP, hx, hy);
  set(LM.LEFT_KNEE, kx2, ky2);
  set(LM.RIGHT_KNEE, ky2 === ky ? kx : kx2, ky2);
  const av = anklesVisible ? visibility : 0.1;
  set(LM.LEFT_ANKLE, ax, ay, av);
  set(LM.RIGHT_ANKLE, ax, ay, av);
  // Reference the unused plain positions so the intent stays readable.
  void kx; void ky;

  return pts;
}

/** Sanity-check that the synthetic frame really encodes the angle we asked for. */
describe('test harness', () => {
  it('produces the requested elbow angle', async () => {
    const { angleDeg } = await import('../src/lib/exercise/geometry');
    for (const want of [90, 120, 170]) {
      const f = frame({ elbowAngle: want });
      const got = angleDeg(f[LM.LEFT_SHOULDER], f[LM.LEFT_ELBOW], f[LM.LEFT_WRIST]);
      expect(got).toBeCloseTo(want, 0);
    }
  });
});

/**
 * Drive a full rep: settle at the top, descend, hold, ascend.
 * `dtMs` per frame at 30fps; timings are chosen to satisfy MIN_REP_MS.
 */
function doRep(
  det: PushupDetector,
  t: { ms: number },
  opts: Partial<FrameOpts> & { bottom?: number; holdMs?: number; stepMs?: number } = {},
) {
  const { bottom = 80, holdMs = 250, stepMs = 33, ...form } = opts;
  const step = (angle: number) => {
    det.process(frame({ elbowAngle: angle, ...form }), t.ms);
    t.ms += stepMs;
  };

  for (let i = 0; i < 5; i++) step(170);               // locked out
  for (let a = 170; a >= bottom; a -= 10) step(a);     // descend
  for (let h = 0; h < Math.ceil(holdMs / stepMs); h++) step(bottom);
  for (let a = bottom; a <= 170; a += 10) step(a);     // ascend
  step(172);                                            // lock out again
}

describe('pushup counting — happy path', () => {
  it('counts a single clean rep', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    doRep(det, t);
    expect(det.autoReps).toBe(1);
  });

  it('counts ten reps as ten', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 10; i++) doRep(det, t);
    expect(det.autoReps).toBe(10);
  });

  it('reports justCounted exactly on the crediting frame', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    let credited = 0;
    const step = (angle: number) => {
      const r = det.process(frame({ elbowAngle: angle }), t.ms);
      if (r.justCounted) credited++;
      t.ms += 33;
    };
    for (let i = 0; i < 5; i++) step(170);
    for (let a = 170; a >= 80; a -= 10) step(a);
    for (let i = 0; i < 8; i++) step(80);
    for (let a = 80; a <= 170; a += 10) step(a);
    step(172);
    expect(credited).toBe(1);
  });
});

describe('pushup counting — the cheat gates', () => {
  it('REJECTS arm curls performed sitting upright', () => {
    // The elbow signal is a perfect rep; the body is vertical.
    const det = new PushupDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { inclination: 85 });
    expect(det.autoReps).toBe(0);
  });

  it('REJECTS reps with the hips piked high', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { hipOffset: -0.2 });
    expect(det.autoReps).toBe(0);
  });

  it('REJECTS reps performed with a sagging back', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { hipOffset: 0.2 });
    expect(det.autoReps).toBe(0);
  });

  it('REJECTS partial reps that never reach depth', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { bottom: 120 });
    expect(det.autoReps).toBe(0);
  });

  it('REJECTS a frantic bounce faster than a real rep', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    // 8ms per frame collapses the whole cycle well under MIN_REP_MS.
    for (let i = 0; i < 5; i++) doRep(det, t, { stepMs: 8, holdMs: 16 });
    expect(det.autoReps).toBe(0);
  });

  it('does not count while the body is barely visible', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { visibility: 0.2 });
    expect(det.autoReps).toBe(0);
  });

  it('does not double-count jitter around the top threshold', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    doRep(det, t);
    expect(det.autoReps).toBe(1);
    // Tremble across UP_ENTER without ever descending.
    for (let i = 0; i < 60; i++) {
      det.process(frame({ elbowAngle: i % 2 ? 158 : 163 }), t.ms);
      t.ms += 33;
    }
    expect(det.autoReps).toBe(1);
  });

  it('does not count micro-oscillation between the exit thresholds', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) {
      det.process(frame({ elbowAngle: 170 }), t.ms);
      t.ms += 33;
    }
    // Park mid-range and wobble: never a full range of motion.
    for (let i = 0; i < 120; i++) {
      det.process(frame({ elbowAngle: i % 2 ? 112 : 148 }), t.ms);
      t.ms += 33;
    }
    expect(det.autoReps).toBe(0);
  });
});

describe('resilience', () => {
  it('survives a brief occlusion mid-rep without losing the rep', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    const step = (angle: number, vis = V) => {
      det.process(frame({ elbowAngle: angle, visibility: vis }), t.ms);
      t.ms += 33;
    };
    for (let i = 0; i < 5; i++) step(170);
    for (let a = 170; a >= 80; a -= 10) step(a);
    // Two dropped frames, well inside GRACE_FRAMES.
    step(80, 0.1);
    step(80, 0.1);
    for (let i = 0; i < 6; i++) step(80);
    for (let a = 80; a <= 170; a += 10) step(a);
    step(172);
    expect(det.autoReps).toBe(1);
  });

  it('handles a null frame without throwing', () => {
    const det = new PushupDetector();
    const r = det.process(null, 1000);
    expect(r.count).toBe(0);
    expect(r.formFeedback).toContain('low_visibility');
  });

  it('counts when the ankles are out of frame (falls back to hips)', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    doRep(det, t, { anklesVisible: false });
    expect(det.autoReps).toBe(1);
  });

  it('surfaces a form hint when the hips sag', () => {
    const det = new PushupDetector();
    const r = det.process(frame({ elbowAngle: 170, hipOffset: 0.2 }), 1000);
    expect(r.formFeedback).toContain('hips_sagging');
  });

  it('tells sagging apart from piking by direction', () => {
    const sagDet = new PushupDetector();
    const sag = sagDet.process(frame({ elbowAngle: 170, hipOffset: 0.2 }), 1000);
    expect(sag.formFeedback).toContain('hips_sagging');
    expect(sag.formFeedback).not.toContain('hips_piked');

    const pikeDet = new PushupDetector();
    const pike = pikeDet.process(frame({ elbowAngle: 170, hipOffset: -0.2 }), 1000);
    expect(pike.formFeedback).toContain('hips_piked');
    expect(pike.formFeedback).not.toContain('hips_sagging');
  });

  it('accepts a rigid plank as good form', () => {
    const det = new PushupDetector();
    const r = det.process(frame({ elbowAngle: 170, hipOffset: 0 }), 1000);
    expect(r.formFeedback).toEqual([]);
  });
});

describe('manual correction', () => {
  it('applies +1 and -1 to the reported total', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    doRep(det, t);
    det.tap(+1);
    expect(det.process(frame({ elbowAngle: 170 }), t.ms).count).toBe(2);
    det.tap(-1);
    expect(det.process(frame({ elbowAngle: 170 }), t.ms).count).toBe(1);
  });

  it('never lets the total go negative', () => {
    const det = new PushupDetector();
    det.tap(-5);
    expect(det.process(frame({ elbowAngle: 170 }), 1000).count).toBe(0);
  });

  it('keeps autoReps and the adjustment separable for provenance', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    doRep(det, t);
    doRep(det, t);
    det.tap(+3);
    expect(det.autoReps).toBe(2);
    expect(det.adjustment).toBe(3);
    // The security rules assert autoReps + manualAdjust === score.
    expect(det.autoReps + det.adjustment).toBe(5);
  });
});

describe('config sanity', () => {
  it('keeps hysteresis dead zones on both ends', () => {
    expect(PUSHUP_CONFIG.UP_EXIT).toBeLessThan(PUSHUP_CONFIG.UP_ENTER);
    expect(PUSHUP_CONFIG.DOWN_EXIT).toBeGreaterThan(PUSHUP_CONFIG.DOWN_ENTER);
    expect(PUSHUP_CONFIG.DOWN_EXIT).toBeLessThan(PUSHUP_CONFIG.UP_EXIT);
  });
});

describe('finalize path', () => {
  it('reports the accumulated count when polled with a null frame', () => {
    // useExerciseSession.finalize() polls the detector with process(null) to
    // read the final total. That must not disturb or lose the count.
    const det = new PushupDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 3; i++) doRep(det, t);
    expect(det.autoReps).toBe(3);

    const polled = det.process(null, t.ms);
    expect(polled.count).toBe(3);
    // Polling repeatedly must stay stable.
    expect(det.process(null, t.ms + 1).count).toBe(3);
    expect(det.autoReps).toBe(3);
  });

  it('keeps a manual adjustment visible through the final poll', () => {
    const det = new PushupDetector();
    const t = { ms: 1000 };
    doRep(det, t);
    det.tap(+2);
    expect(det.process(null, t.ms).count).toBe(3);
  });
});
