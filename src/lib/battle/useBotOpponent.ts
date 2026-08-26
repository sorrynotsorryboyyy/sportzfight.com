'use client';

import { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { serverNow } from '@/lib/firebase/clock';
import { joinAsBot } from '@/lib/firebase/battles';
import { botScoreAt, planBot, type BotPlan } from './bot';
import { goInstantMs, hardEndMs, SCORE_FLUSH_MS } from './constants';
import type { BattleDoc } from './types';

/**
 * Plays the bot's side, from the human's browser.
 *
 * The bot has no account and no server, so the only place left to drive it is
 * the opponent's own tab. The rules allow exactly this and nothing more: only
 * on a battle that declared `botLevel` at creation, and only from its creator.
 *
 * The consequence is deliberate and contained — the bot's score is forgeable —
 * which is why bot wins never reach the world ranking.
 *
 * Writes on the same 1.5s cadence a human's ScoreSync uses, so the opponent
 * bar behaves identically to a real match.
 */

/**
 * How long a lone player waits before the bot steps in.
 *
 * Long enough that two people searching at the same moment find each other —
 * matchmaking resolves in about a second — and short enough that the lobby
 * never feels abandoned.
 */
export const BOT_JOIN_DELAY_MS = 8_000;

export function useBotOpponent(
  battle: (BattleDoc & { id: string }) | null,
  /** Only player1 drives; slot 2 never exists in a bot battle. */
  slot: 1 | 2 | null,
): void {
  const plan = useRef<BotPlan | null>(null);
  const committed = useRef(0);
  const readied = useRef(false);
  const finalised = useRef(false);
  const writing = useRef(false);
  const seated = useRef(false);

  const isBot = !!battle?.botLevel;
  const id = battle?.id ?? null;

  // A new battle means a new plan. Seeded from the document so the same match
  // replays identically when debugging.
  useEffect(() => {
    plan.current = null;
    committed.current = 0;
    readied.current = false;
    finalised.current = false;
    seated.current = false;
  }, [id]);

  // ---- seat the bot, but only after giving a human the chance ----
  //
  // Done here rather than in matchmaking so a real player arriving during the
  // wait still wins the seat: the join rule is a compare-and-swap on player2,
  // so whoever commits first takes it and the other write is denied.
  useEffect(() => {
    // isBot, not just slot 1: a human battle has no botLevel, so seating would
    // be denied on every attempt.
    if (!battle || !isBot || slot !== 1) return;
    if (battle.player2 != null || battle.status !== 'waiting') return;
    if (seated.current) return;

    const timer = setTimeout(() => {
      seated.current = true;
      void joinAsBot(battle.id, battle.player1).catch(() => {
        // A human beat us to the seat, which is the outcome we prefer.
        seated.current = false;
      });
    }, BOT_JOIN_DELAY_MS);

    return () => clearTimeout(timer);
  }, [battle, isBot, slot]);

  // ---- ready, so the countdown can start ----
  useEffect(() => {
    if (!battle || !isBot || slot !== 1) return;
    if (readied.current || battle.player2Ready) return;
    if (battle.player2 == null) return; // not seated yet

    readied.current = true;
    void updateDoc(doc(db(), 'battles', battle.id), {
      player2Ready: true,
    }).catch(() => {
      // A denied write here just means no countdown; the lobby stays put
      // rather than showing a half-started match.
      readied.current = false;
    });
  }, [battle, isBot, slot]);

  // ---- score, on the human cadence ----
  useEffect(() => {
    if (!battle || !isBot || slot !== 1) return;
    if (battle.status !== 'live' || !battle.startedAt) return;
    if (finalised.current) return;

    const startedMs = battle.startedAt.toMillis();
    if (!plan.current) {
      plan.current = planBot(
        battle.durationSecs,
        battle.botLevel ?? 'normal',
        battle.botSeed ?? 1,
      );
    }

    const tick = async () => {
      const p = plan.current;
      if (!p || writing.current || finalised.current) return;

      const now = serverNow();
      const elapsed = now - goInstantMs(startedMs);
      const past = now > hardEndMs(startedMs, battle.durationSecs);

      const target = past ? p.total : botScoreAt(p, elapsed);
      // Monotonic: the rules reject any decrease, and a rejected write would
      // leave the opponent frozen for the rest of the battle.
      if (target <= committed.current && !past) return;

      const score = Math.max(committed.current, target);
      writing.current = true;
      try {
        await updateDoc(doc(db(), 'battles', battle.id), {
          player2Score: score,
          player2Final: past,
          player2Meta: { autoReps: score, manualAdjust: 0, source: 'camera' },
        });
        committed.current = score;
        if (past) finalised.current = true;
      } catch {
        // Outside the score window, or the battle moved on. Either way the
        // next tick re-reads the state rather than retrying blindly.
      } finally {
        writing.current = false;
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), SCORE_FLUSH_MS);
    return () => clearInterval(timer);
  }, [battle, isBot, slot]);
}
