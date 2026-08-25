// Rewrites the player lobby so it mirrors the in-play screen: you on top,
// opponent reduced to a bar above the ready button.
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/app/battle/[id]/page.tsx';
let s = readFileSync(P, 'utf8');

// --- 1. top block: your identity instead of two symmetric cards ---
const oldTop = `        {/* top: identity + both players */}
        <div className="bg-gradient-to-b from-ink-950/90 to-transparent p-4 pb-10">
          <div className="pointer-events-auto mb-3 flex items-center justify-between">
            <Link href="/">
              <Logo className="text-lg" />
            </Link>
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400">
              {exercise.emoji} {exercise.label} · {battle.durationSecs}s
            </span>
          </div>

          <div className="flex items-stretch gap-2">
            <PlayerCard
              name={p1Name}
              score={0}
              isSelf={slot === 1}
              slot={1}
              compact
              ready={battle.player1Ready}
              connected={!isStale(battle, 1, serverNow())}
            />
            <PlayerCard
              name={p2Name}
              score={0}
              isSelf={slot === 2}
              slot={2}
              compact
              ready={battle.player2Ready}
              connected={
                !!battle.player2 && !isStale(battle, 2, serverNow())
              }
            />
          </div>
        </div>`;

const newTop = `        {/* top: you only. Same hierarchy as the in-play screen, so the two
            phases read as one continuous experience. */}
        <div className="bg-gradient-to-b from-ink-950/90 to-transparent p-4 pb-12">
          <div className="pointer-events-auto mb-4 flex items-center justify-between">
            <Link href="/">
              <Logo className="text-lg" />
            </Link>
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400">
              {exercise.emoji} {exercise.label} · {battle.durationSecs}s
            </span>
          </div>

          <p className="truncate text-[0.65rem] font-bold uppercase tracking-widest text-volt-500">
            {meName}
          </p>
          <p className="mt-1 text-2xl font-black uppercase leading-none tracking-tight text-ink-100">
            {myReady ? 'Prêt' : 'En position'}
          </p>
        </div>`;

if (!s.includes(oldTop)) throw new Error('top block not found');
s = s.replace(oldTop, newTop);

// --- 2. bottom block: opponent bar above the ready control ---
const oldBottom = `          ) : (
            <div className="pointer-events-auto flex flex-col gap-3">
              <p className="text-center text-xs leading-relaxed text-ink-400">
                {exercise.setupHint}
              </p>
              <Button
                size="xl"
                variant={myReady ? 'secondary' : 'primary'}
                onClick={() => slot && void setReady(battle.id, slot, !myReady)}
                className={!myReady ? 'animate-pulse-ring' : undefined}
              >
                {myReady ? 'ANNULER' : 'JE SUIS PRÊT'}
              </Button>
              {myReady && (
                <p className="text-center text-sm text-ink-400">
                  En attente de ton adversaire…
                </p>
              )}
            </div>
          )}`;

const newBottom = `          ) : (
            <div className="pointer-events-auto flex flex-col gap-3">
              {/* No score yet, so the bar shows readiness instead. Without it
                  the wait is opaque: you cannot tell whether the opponent is
                  still there or has walked away. */}
              <OpponentBar
                name={oppName}
                avatar={oppAvatar}
                connected={opponentConnected}
                ready={slot === 1 ? battle.player2Ready : battle.player1Ready}
              />
              <p className="text-center text-xs leading-relaxed text-ink-400">
                {exercise.setupHint}
              </p>
              <Button
                size="xl"
                variant={myReady ? 'secondary' : 'primary'}
                onClick={() => slot && void setReady(battle.id, slot, !myReady)}
                className={!myReady ? 'animate-pulse-ring' : undefined}
              >
                {myReady ? 'ANNULER' : 'JE SUIS PRÊT'}
              </Button>
              {myReady && (
                <p className="text-center text-sm text-ink-400">
                  En attente de ton adversaire…
                </p>
              )}
            </div>
          )}`;

if (!s.includes(oldBottom)) throw new Error('bottom block not found');
s = s.replace(oldBottom, newBottom);

writeFileSync(P, s);
console.log('lobby rewritten');
