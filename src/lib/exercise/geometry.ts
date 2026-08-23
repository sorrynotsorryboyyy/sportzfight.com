import type { Landmark } from './types';

/**
 * Interior angle ABC in degrees, using the 2D projection.
 *
 * We deliberately ignore z: MediaPipe's depth estimate from a single camera is
 * far noisier than x/y, and for a body viewed side-on (the natural pushup
 * framing) the 2D projection already carries the joint angle faithfully.
 */
export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const dot = abx * cbx + aby * cby;
  const magA = Math.hypot(abx, aby);
  const magC = Math.hypot(cbx, cby);
  if (magA < 1e-6 || magC < 1e-6) return Number.NaN;

  // Clamp guards against floating-point drift pushing |cos| just past 1.
  const cos = Math.min(1, Math.max(-1, dot / (magA * magC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Inclination of the segment AB relative to horizontal, 0..90 degrees. */
export function inclinationDeg(a: Landmark, b: Landmark): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx < 1e-6 && dy < 1e-6) return Number.NaN;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Midpoint of two landmarks, averaging visibility too. */
export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

/** Exponential moving average — smooths landmark jitter out of a signal. */
export class Ema {
  private value: number | null = null;
  constructor(private readonly alpha: number) {}

  push(x: number): number {
    if (!Number.isFinite(x)) return this.value ?? Number.NaN;
    this.value = this.value === null ? x : this.alpha * x + (1 - this.alpha) * this.value;
    return this.value;
  }

  get current(): number {
    return this.value ?? Number.NaN;
  }

  reset(): void {
    this.value = null;
  }
}

/**
 * `visibility` is a learned occlusion score. Values are meaningful but a
 * landmark can also be absent entirely, so guard the lookup as well.
 */
export function visibilityOf(lms: Landmark[], idx: number): number {
  const lm = lms[idx];
  if (!lm || typeof lm.visibility !== 'number' || !Number.isFinite(lm.visibility)) {
    return 0;
  }
  return lm.visibility;
}

export function meanVisibility(lms: Landmark[], idxs: readonly number[]): number {
  if (!idxs.length) return 0;
  let sum = 0;
  for (const i of idxs) sum += visibilityOf(lms, i);
  return sum / idxs.length;
}

/** True when every listed landmark clears the per-joint bar. */
export function allVisible(
  lms: Landmark[],
  idxs: readonly number[],
  min: number,
): boolean {
  return idxs.every((i) => visibilityOf(lms, i) >= min);
}

/**
 * Signed perpendicular offset of point P from the line AB, normalised by the
 * length of AB. Positive means P lies on one side, negative the other.
 *
 * This is how hip sag is told apart from hip pike. An unsigned interior angle
 * cannot do it: acos only ever returns 0..180, so a back arched to "195
 * degrees" measures identically to one piked to 165, and the two faults would
 * be indistinguishable.
 */
export function signedOffset(a: Landmark, b: Landmark, p: Landmark): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = Math.hypot(abx, aby);
  if (len < 1e-6) return Number.NaN;
  // 2D cross product of AB with AP, divided by |AB|.
  return ((p.x - a.x) * aby - (p.y - a.y) * abx) / (len * len);
}

/**
 * Median of the last three samples.
 *
 * A median removes single-frame spikes — the dominant landmark artefact —
 * with essentially no lag, unlike an EMA, which must trade responsiveness for
 * smoothness. Pairing a median with a light EMA gives clean thresholds without
 * the smoothed value trailing the athlete's real position.
 */
export class Median3 {
  private a: number | null = null;
  private b: number | null = null;

  push(x: number): number {
    if (!Number.isFinite(x)) return x;
    const [p, q] = [this.a, this.b];
    this.b = this.a;
    this.a = x;
    if (p === null || q === null) return x;
    return Math.max(Math.min(x, p), Math.min(Math.max(x, p), q));
  }

  reset(): void {
    this.a = null;
    this.b = null;
  }
}

/** Map a value from one range to 0..1, clamped. */
export function normalize(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v) || hi === lo) return 0;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}
