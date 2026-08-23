'use client';

import { SCORE_FLUSH_MS } from '@/lib/battle/constants';
import type { PlayerSlot, ScoreMeta } from '@/lib/battle/types';

/**
 * Throttled score writer.
 *
 * Two constraints shape this:
 *
 * 1. Never write at frame rate. Reps happen at ~1Hz but frames arrive at 30Hz;
 *    writing per frame would burn quota and rate-limit the document. We flush
 *    at most once per SCORE_FLUSH_MS, and only when the value actually moved.
 *
 * 2. Scores must be monotonically non-decreasing on the wire, because the
 *    security rules reject a decrease (that is what stops an opponent
 *    sabotaging a score). The manual "-1" correction therefore adjusts the
 *    LOCAL count only; this class tracks the high-water mark it has already
 *    committed and never sends anything below it. A correction simply delays
 *    the next upward flush rather than issuing an illegal write.
 */
export class ScoreSync {
  private committed = 0;
  private pending: { score: number; meta: ScoreMeta } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushMs = 0;
  private closed = false;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly write: (
      slot: PlayerSlot,
      score: number,
      meta: ScoreMeta,
      final: boolean,
    ) => Promise<void>,
    private readonly slot: PlayerSlot,
    private readonly onError?: (e: unknown) => void,
  ) {}

  /** The highest value successfully written so far. */
  get committedScore(): number {
    return this.committed;
  }

  /**
   * Report the current local count. Cheap to call every frame — it only
   * schedules work when the value has actually risen above what we sent.
   */
  push(score: number, meta: ScoreMeta): void {
    if (this.closed) return;
    if (score <= this.committed) return; // monotonic: nothing new to say

    this.pending = { score, meta };

    const now = Date.now();
    const elapsed = now - this.lastFlushMs;

    if (elapsed >= SCORE_FLUSH_MS) {
      void this.flush(false);
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush(false);
      }, SCORE_FLUSH_MS - elapsed);
    }
  }

  private async flush(final: boolean): Promise<void> {
    const payload = this.pending;
    if (!payload && !final) return;

    // Serialise writes so a slow request cannot be overtaken by a later one
    // and leave a stale value as the last word.
    this.inFlight = this.inFlight.then(async () => {
      const p = this.pending;
      if (!p && !final) return;

      const score = p?.score ?? this.committed;
      const meta =
        p?.meta ?? ({ autoReps: this.committed, manualAdjust: 0, source: 'camera' } as ScoreMeta);

      this.pending = null;
      this.lastFlushMs = Date.now();

      try {
        await this.write(this.slot, score, meta, final);
        this.committed = Math.max(this.committed, score);
      } catch (e) {
        // Put the value back so the next tick retries, unless this was the
        // final flush (where the caller decides how to handle failure).
        if (!final && score > this.committed) this.pending = { score, meta };
        this.onError?.(e);
      }
    });

    return this.inFlight;
  }

  /**
   * Write the last value and latch `final`, so the opponent's screen knows
   * this side has stopped counting. Called exactly once, at t=0.
   */
  async finalFlush(score: number, meta: ScoreMeta): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // The final value must still respect monotonicity: if a manual correction
    // pushed the local count below what we already committed, the committed
    // value stands. The meta must then be reconciled to match, because the
    // security rules assert autoReps + manualAdjust === score and would
    // otherwise reject the write, losing the athlete's final score entirely.
    const finalScore = Math.max(score, this.committed);
    const finalMeta: ScoreMeta =
      finalScore === score
        ? meta
        : { ...meta, manualAdjust: finalScore - meta.autoReps };

    this.pending = { score: finalScore, meta: finalMeta };
    await this.flush(true);
  }

  /** Abandon any pending work (unmount, disconnect). */
  cancel(): void {
    this.closed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }
}
