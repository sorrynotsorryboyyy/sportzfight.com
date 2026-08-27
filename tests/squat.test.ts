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
      // Straddling DOWN_EXIT (112) and UP_EXIT (150): deep enough to
      // leave `up`, never deep enough to enter `down`. These values
      // tracked DOWN_EXIT when it was 115 and have to keep tracking it.
      det.process(frame({ kneeAngle: i % 2 ? 114 : 148 }), t.ms);
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

describe('squat depth — the half-rep band', () => {
  /**
   * The band the shipped detector waved through.
   *
   * MIN_ROM_DEG was 50 and the envelope is measured from STANDING (~175), so
   * ROM >= 50 was satisfied by any bottom <= 126 — while DOWN_ENTER claimed to
   * demand 100. Nothing tested between those two numbers, so nothing caught
   * that ROM, not depth, was the binding gate. These are the reps a player
   * could do all day and score on.
   */
  it.each([105, 112, 120])('REJECTS a half squat bottoming at %i deg', (bottom) => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { bottom });
    expect(det.autoReps).toBe(0);
  });

  it('ACCEPTS a genuine parallel squat', () => {
    // "Cuisses parallèles au sol" — the standard the app now holds people to.
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 5; i++) doRep(det, t, { bottom: 92 });
    expect(det.autoReps).toBe(5);
  });

  it('ACCEPTS a squat that goes below parallel', () => {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    for (let i = 0; i < 3; i++) doRep(det, t, { bottom: 80 });
    expect(det.autoReps).toBe(3);
  });

  it('REJECTS a half squat driven at speed, with no dwell at the bottom', () => {
    /**
     * doRep holds the bottom long enough for the EMA to settle. A real athlete
     * does not: they reverse immediately. Driven with no dwell, so the recorded
     * minimum comes from a moving trace rather than a settled one.
     *
     * Worth stating plainly: the smoothing lags, so a fast dip reads SHALLOWER
     * than the body actually went, never deeper. That direction is the safe
     * one — it can cost an honest athlete a rep, but it cannot manufacture
     * depth that did not happen.
     */
    const det = new SquatDetector();
    const t = { ms: 1000 };
    const step = (angle: number) => {
      det.process(frame({ kneeAngle: angle }), t.ms);
      t.ms += 33;
    };

    for (let cycle = 0; cycle < 6; cycle++) {
      for (let i = 0; i < 6; i++) step(175);
      for (let a = 170; a >= 110; a -= 5) step(a);
      for (let a = 110; a <= 175; a += 5) step(a);
      step(176);
    }

    expect(det.autoReps).toBe(0);
  });

  it('REJECTS bobbing after a single touch of depth', () => {
    /**
     * One shallow dip put the detector into `down`, and every later bob
     * between DOWN_EXIT and UP_ENTER re-entered `down` then credited on the
     * way up. descentStartMs was never reseated, so cycleMs only grew and
     * MIN_REP_MS stopped resisting after the first rep.
     */
    const det = new SquatDetector();
    const t = { ms: 1000 };
    const step = (angle: number) => {
      det.process(frame({ kneeAngle: angle }), t.ms);
      t.ms += 33;
    };

    for (let i = 0; i < 5; i++) step(175);
    for (let a = 175; a >= 92; a -= 10) step(a);
    for (let i = 0; i < 7; i++) step(92);
    for (let a = 92; a <= 175; a += 10) step(a);
    step(176);
    expect(det.autoReps).toBe(1);

    // Every subsequent shallow bob must earn its own depth.
    for (let cycle = 0; cycle < 8; cycle++) {
      for (let a = 175; a >= 118; a -= 10) step(a);
      for (let i = 0; i < 6; i++) step(118);
      for (let a = 118; a <= 175; a += 10) step(a);
      step(176);
    }
    expect(det.autoReps).toBe(1);
  });

  it('REJECTS re-entering depth from mid-ascent without a fresh descent', () => {
    // A rep with a mid-ascent collapse is not a clean rep. This is a
    // DELIBERATE tightening: before, the shallow re-entry rode on the first
    // dip's envelope and scored.
    const det = new SquatDetector();
    const t = { ms: 1000 };
    const step = (angle: number) => {
      det.process(frame({ kneeAngle: angle }), t.ms);
      t.ms += 33;
    };

    for (let i = 0; i < 5; i++) step(175);
    for (let a = 175; a >= 92; a -= 10) step(a);
    for (let i = 0; i < 7; i++) step(92);
    // rise to 130 (ascending), sink back to 92 (re-enters `down`), then out
    for (let a = 92; a <= 130; a += 10) step(a);
    for (let a = 130; a >= 92; a -= 10) step(a);
    for (let i = 0; i < 7; i++) step(92);
    for (let a = 92; a <= 175; a += 10) step(a);
    step(176);

    // The re-entry reseats the envelope, so this second bottom qualifies on
    // its own — and it cannot: ROM is measured from 92, not from standing.
    expect(det.autoReps).toBe(0);
  });
});

describe('the gates agree with each other', () => {
  /**
   * THE invariant this detector shipped without.
   *
   * The squat envelope is NOT reset on up -> descending, so repMaxAngle holds
   * the standing angle (~175) and ROM = 175 - bottom. With MIN_ROM_DEG at 50
   * that admitted bottom <= 126 while DOWN_ENTER claimed to demand 100: two
   * gates disagreeing by 26 degrees, with the LOOSER one binding. Every half
   * squat in that band scored. Pushup gets this property for free by resetting
   * its envelope; squat has to assert it.
   */
  /**
   * Measured, not derived.
   *
   * The tempting formula is ROM = standing - bottom, and it is WRONG: the
   * envelope is reseeded on every settled standing frame and the smoothing
   * eats part of the descent, so a rep bottoming at 90 records 70.6 degrees of
   * range, not 85. Deriving MIN_ROM_DEG from the formula rather than measuring
   * it is exactly how the shipped config ended up 26 degrees apart from the
   * depth it claimed to enforce. This helper replays a real rep through the
   * detector and reports what the gates actually saw.
   */
  function peakOf(bottom: number) {
    const det = new SquatDetector();
    const t = { ms: 1000 };
    let rom = 0;
    let drop = 0;
    const step = (angle: number) => {
      const r = det.process(frame({ kneeAngle: angle }), t.ms);
      rom = Math.max(rom, r.debug?.rangeOfMotion ?? 0);
      const d = r.debug?.hipDeviation ?? Number.NaN;
      if (Number.isFinite(d)) drop = Math.max(drop, d);
      t.ms += 33;
    };
    for (let i = 0; i < 5; i++) step(175);
    for (let a = 175; a >= bottom; a -= 10) step(a);
    for (let h = 0; h < 7; h++) step(bottom);
    for (let a = bottom; a <= 175; a += 10) step(a);
    step(176);
    return { rom, drop, counted: det.autoReps };
  }

  it('never lets the ROM gate be looser than the depth gate', () => {
    // A rep that just reaches depth must clear MIN_ROM_DEG, and a half squat
    // must not. The bug was that the second half of this was false: ROM
    // admitted a bottom of 126 while depth claimed to demand 100.
    expect(peakOf(92).rom).toBeGreaterThanOrEqual(SQUAT_CONFIG.MIN_ROM_DEG);
    expect(peakOf(105).rom).toBeLessThan(SQUAT_CONFIG.MIN_ROM_DEG);
    expect(peakOf(120).rom).toBeLessThan(SQUAT_CONFIG.MIN_ROM_DEG);
  });

  it('asks for a hip drop consistent with the knee angle it demands', () => {
    // A parallel squat must clear MIN_HIP_DROP, or the two gates contradict
    // and a textbook rep is rejected for a reason the athlete cannot see.
    expect(peakOf(92).drop).toBeGreaterThan(SQUAT_CONFIG.MIN_HIP_DROP);
    // And the half squat the old 0.10 waved through must not.
    expect(peakOf(126).drop).toBeLessThan(SQUAT_CONFIG.MIN_HIP_DROP);
  });

  it('demands real depth, not a quarter squat', () => {
    // Guards the headline number against a well-meaning future loosening.
    expect(SQUAT_CONFIG.DOWN_ENTER).toBeLessThanOrEqual(95);
  });
});
