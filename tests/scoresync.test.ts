import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ScoreSync } from '../src/lib/exercise/runtime/ScoreSync';
import type { ScoreMeta } from '../src/lib/battle/types';

const meta = (auto: number, adj = 0): ScoreMeta => ({
  autoReps: auto,
  manualAdjust: adj,
  source: 'camera',
});

/** Mirrors the rules constraint: autoReps + manualAdjust must equal score. */
function assertMetaConsistent(score: number, m: ScoreMeta) {
  expect(m.autoReps + m.manualAdjust).toBe(score);
}

describe('ScoreSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes the first change immediately', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const s = new ScoreSync(write, 1);
    s.push(1, meta(1));
    await vi.runAllTimersAsync();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(1, 1, meta(1), false);
  });

  it('does NOT write once per rep at frame rate', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const s = new ScoreSync(write, 1);
    // 30 updates in quick succession, as a camera would produce.
    for (let i = 1; i <= 30; i++) {
      s.push(i, meta(i));
      await vi.advanceTimersByTimeAsync(50);
    }
    // Far fewer writes than pushes: throttled, not per-rep.
    expect(write.mock.calls.length).toBeLessThan(8);
    // And the newest value still gets through.
    const last = write.mock.calls.at(-1)!;
    expect(last[1]).toBe(30);
  });

  it('never writes a decreasing score', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const s = new ScoreSync(write, 1);
    s.push(10, meta(10));
    await vi.runAllTimersAsync();
    s.push(4, meta(4)); // a manual -6 correction
    await vi.runAllTimersAsync();

    const scores = write.mock.calls.map((c) => c[1] as number);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
    expect(Math.min(...scores)).toBe(10);
  });

  it('keeps meta consistent with the score on every write', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const s = new ScoreSync(write, 1);
    s.push(5, meta(5));
    await vi.runAllTimersAsync();
    s.push(8, meta(6, 2));
    await vi.runAllTimersAsync();

    for (const [, score, m] of write.mock.calls) {
      assertMetaConsistent(score as number, m as ScoreMeta);
    }
  });

  it('latches final on the last write', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const s = new ScoreSync(write, 2);
    s.push(3, meta(3));
    await vi.runAllTimersAsync();
    await s.finalFlush(7, meta(7));

    const last = write.mock.calls.at(-1)!;
    expect(last[1]).toBe(7);
    expect(last[3]).toBe(true);
  });

  it('final flush keeps meta consistent even after a downward correction', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const s = new ScoreSync(write, 1);
    s.push(10, meta(10));
    await vi.runAllTimersAsync();
    expect(s.committedScore).toBe(10);

    // Athlete corrects down to 8; monotonicity forces us to keep 10, so the
    // meta must be reconciled to match, or the rules reject the write.
    await s.finalFlush(8, meta(8));

    const last = write.mock.calls.at(-1)!;
    const [, score, m, final] = last as [number, number, ScoreMeta, boolean];
    expect(final).toBe(true);
    expect(score).toBe(10);
    assertMetaConsistent(score, m);
  });

  it('retries a failed write on the next push', async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const s = new ScoreSync(write, 1, () => {});
    s.push(5, meta(5));
    await vi.runAllTimersAsync();
    expect(s.committedScore).toBe(0); // failed, nothing committed

    s.push(6, meta(6));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.runAllTimersAsync();
    expect(s.committedScore).toBe(6);
  });

  it('ignores pushes after cancel', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const s = new ScoreSync(write, 1);
    s.cancel();
    s.push(9, meta(9));
    await vi.runAllTimersAsync();
    expect(write).not.toHaveBeenCalled();
  });

  it('only latches final once', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const s = new ScoreSync(write, 1);
    await s.finalFlush(4, meta(4));
    await s.finalFlush(9, meta(9));
    const finals = write.mock.calls.filter((c) => c[3] === true);
    expect(finals).toHaveLength(1);
  });
});
