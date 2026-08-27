'use client';

import { cn } from '@/lib/utils/cn';

/**
 * A phone showing the battle screen, drawn in CSS.
 *
 * A landing page for an app needs to show the app. A screenshot would go stale
 * the moment the battle UI changes and would need exporting, hosting and
 * re-cropping; this is built from the same tokens as the real screen, so it
 * stays honest for free and adds no asset to maintain.
 *
 * Purely decorative: hidden from assistive tech, since the surrounding copy
 * already says what the product does.
 */
export function PhoneMockup({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('relative mx-auto w-full max-w-[16rem]', className)}
    >
      {/* Glow behind the device, so it does not float on flat black. */}
      <div className="pointer-events-none absolute -inset-8 rounded-full bg-volt-500/10 blur-3xl" />

      {/* Device shell */}
      <div className="relative aspect-[9/19] w-full rounded-[2.25rem] border-[3px] border-ink-700 bg-ink-950 p-2 shadow-2xl shadow-ink-950">
        {/* Screen */}
        <div className="relative size-full overflow-hidden rounded-[1.75rem] bg-ink-900">
          {/* Camera view: a suggestion of a lit room, not a fake photo. */}
          <div className="absolute inset-0 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900" />
          <div className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-volt-500/5 blur-2xl" />

          {/* The tracked skeleton, in a plank. Same volt green as the real
              overlay when the pose is valid. */}
          <svg
            viewBox="0 0 100 200"
            className="absolute inset-0 size-full"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <g className="text-volt-500/80">
              {/* torso line, shoulders to ankles */}
              <line x1="30" y1="112" x2="76" y2="126" />
              {/* arm: shoulder → elbow → wrist */}
              <line x1="30" y1="112" x2="31" y2="128" />
              <line x1="31" y1="128" x2="29" y2="142" />
              {/* hip → knee → ankle */}
              <line x1="55" y1="119" x2="66" y2="123" />
              <line x1="66" y1="123" x2="76" y2="126" />
            </g>
            <g className="text-volt-400" fill="currentColor" stroke="none">
              {[
                [30, 112],
                [31, 128],
                [29, 142],
                [55, 119],
                [66, 123],
                [76, 126],
              ].map(([cx, cy]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.6" />
              ))}
            </g>
          </svg>

          {/* "Détecté" chip, exactly as the real CameraStage shows it DURING
              THE EFFORT, which is the screen this mockup depicts. The lobby
              moves it to top-right, out of the logo's way — so if the in-play
              corner ever moves, this has to move with it or the landing page
              starts advertising a screen that does not exist. */}
          <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-ink-950/80 px-2 py-0.5 backdrop-blur">
            <span className="size-1 rounded-full bg-volt-500" />
            <span className="text-[0.4rem] font-bold uppercase tracking-widest text-ink-300">
              Détecté
            </span>
          </div>

          {/* Your score and the clock, overlaid at the top. */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-ink-950/85 to-transparent p-3 pb-8 pt-9">
            <div>
              <p className="text-[0.4rem] font-bold uppercase tracking-widest text-volt-500">
                Toi
              </p>
              <p className="tnum text-3xl font-black leading-none text-volt-500">
                27
              </p>
            </div>
            <div className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-volt-500/70">
              <span className="tnum text-sm font-black text-ink-100">18</span>
            </div>
          </div>

          {/* Opponent bar at the bottom. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/85 to-transparent p-3 pt-8">
            <div className="flex items-center gap-2 rounded-lg border border-flare-500/25 bg-ink-950/75 px-2 py-1.5 backdrop-blur">
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-ink-800 text-[0.4rem] font-bold text-ink-400">
                A
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.45rem] font-bold text-ink-200">
                Apollo
              </span>
              <span className="tnum text-base font-black leading-none text-flare-400">
                24
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
