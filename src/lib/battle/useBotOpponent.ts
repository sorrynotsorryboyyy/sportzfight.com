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
  const battleId = battle?.id ?? null;

  // A new battle means a new plan. Seeded from the document so the same match
  // replays identically when debugging.
  useEffect(() => {
    plan.current = null;
    committed.current = 0;
    readied.current = false;
    finalised.current = false;
    seated.current = false;
  }, [battleId]);

  // ---- seat the bot, but only after giving a human the chance ----
  //
  // Done here rather than in matchmaking so a real player arriving during the
  // wait still wins the seat: the join rule is a compare-and-swap on player2,
  // so whoever commits first takes it and the other write is denied.
  //
  // The dependencies are PRIMITIVES, not the battle document. The heartbeat
  // rewrites that document every 5 seconds, so depending on it tore down this
  // 8-second timer before it could ever fire — the bot never arrived, and the
  // lobby waited forever exactly as it did before bots existed.
  const waitingAlone =
    isBot && slot === 1 && battle?.player2 == null && battle?.status === 'waiting';
  const player1 = battle?.player1 ?? null;

  useEffect(() => {
    if (!waitingAlone || !battleId || !player1) return;
    if (seated.current) return;

    const timer = setTimeout(() => {
      seated.current = true;
      void joinAsBot(battleId, player1).catch(() => {
        // A human beat us to the seat, which is the outcome we prefer.
        seated.current = false;
      });
    }, BOT_JOIN_DELAY_MS);

    return () => clearTimeout(timer);
  }, [waitingAlone, battleId, player1]);

  // ---- ready, so the countdown can start ----
  const botSeated = isBot && slot === 1 && battle?.player2 != null;
  const botReady = battle?.player2Ready === true;

  useEffect(() => {
    if (!botSeated || !battleId || botReady) return;
    if (readied.current) return;

    readied.current = true;
    void updateDoc(doc(db(), 'battles', battleId), {
      player2Ready: true,
    }).catch(() => {
      // A denied write here just means no countdown; the lobby stays put
      // rather than showing a half-started match.
      readied.current = false;
    });
  }, [botSeated, botReady, battleId]);

  // ---- score, on the human cadence ----
  //
  // Primitives again, for the same reason as the seating effect and more
  // urgently: during a live battle the document changes on every score write,
  // so depending on it would restart this interval before it could ever tick.
  const live = isBot && slot === 1 && battle?.status === 'live';
  const startedMs = battle?.startedAt?.toMillis() ?? null;
  const durationSecs = battle?.durationSecs ?? null;
  const level = battle?.botLevel ?? 'normal';
  const seed = battle?.botSeed ?? 1;

  useEffect(() => {
    if (!live || !battleId || startedMs == null || durationSecs == null) return;
    if (finalised.current) return;

    if (!plan.current) {
      plan.current = planBot(durationSecs, level, seed);
    }

    const tick = async () => {
      const p = plan.current;
      if (!p || writing.current || finalised.current) return;

      const now = serverNow();
      const elapsed = now - goInstantMs(startedMs);
      const past = now > hardEndMs(startedMs, durationSecs);

      const target = past ? p.total : botScoreAt(p, elapsed);
      // Monotonic: the rules reject any decrease, and a rejected write would
      // leave the opponent frozen for the rest of the battle.
      if (target <= committed.current && !past) return;

      const score = Math.max(committed.current, target);
      writing.current = true;
      try {
        await updateDoc(doc(db(), 'battles', battleId), {
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
  }, [live, battleId, startedMs, durationSecs, level, seed]);
}
