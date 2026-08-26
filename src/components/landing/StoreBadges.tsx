import { cn } from '@/lib/utils/cn';

/**
 * App Store and Google Play badges.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  THERE IS NO MOBILE APP YET. Neither store listing exists.
 *
 *  Replace the two constants below with the real listing URLs the day
 *  they do. Nothing else needs touching: a badge with a URL renders as
 *  a link, a badge without one renders inert and says "Bientôt", so
 *  nobody is ever sent to a 404.
 * ─────────────────────────────────────────────────────────────────────
 */
const APP_STORE_URL: string | null = null;
const PLAY_STORE_URL: string | null = null;

/** Drawn rather than imported: public/ holds no images, and SVG follows the theme. */
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-7 shrink-0" aria-hidden>
      <path d="M17.05 12.54c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.77 2.29-1.61 2.79-.41 6.92 1.15 9.18.76 1.11 1.67 2.35 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.23-.02 2.02-1.12 2.78-2.23.88-1.28 1.24-2.52 1.26-2.58-.03-.01-2.4-.92-2.42-3.66zM14.8 5.36c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.68 1.37-.59.68-1.1 1.77-.96 2.81 1.02.08 2.06-.52 2.7-1.28z" />
    </svg>
  );
}

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0" aria-hidden>
      {/* The four faces of the Play triangle, in its own brand colours so the
          badge stays recognisable against the dark panel. */}
      <path d="M3.6 2.4c-.25.26-.4.67-.4 1.2v16.8c0 .53.15.94.4 1.2l.09.08 9.4-9.4v-.22l-9.4-9.4-.09.09z" fill="#00d3ff" />
      <path d="m16.2 15.5-3.1-3.1v-.22l3.1-3.1.07.04 3.72 2.11c1.06.6 1.06 1.59 0 2.2l-3.72 2.11-.07-.04z" fill="#ffce00" />
      <path d="m16.27 15.46-3.17-3.17-9.5 9.5c.35.37.93.42 1.58.05l11.09-6.38z" fill="#ff3a44" />
      <path d="M16.27 8.54 5.18 2.16c-.65-.37-1.23-.32-1.58.05l9.5 9.5 3.17-3.17z" fill="#00f076" />
    </svg>
  );
}

function Badge({
  href,
  mark,
  top,
  bottom,
}: {
  href: string | null;
  mark: React.ReactNode;
  top: string;
  bottom: string;
}) {
  const shell = cn(
    'flex items-center gap-2.5 rounded-xl border px-3.5 py-2 transition-colors',
    href
      ? 'border-ink-700 bg-ink-900 hover:border-ink-600 hover:bg-ink-850'
      : 'cursor-not-allowed border-ink-800 bg-ink-900/50',
  );

  const inner = (
    <>
      <span className={cn(!href && 'opacity-45')}>{mark}</span>
      <span className="text-left leading-none">
        <span className="block text-3xs uppercase tracking-wide text-ink-400">
          {top}
        </span>
        <span
          className={cn(
            'mt-0.5 block text-sm font-bold tracking-tight',
            href ? 'text-ink-100' : 'text-ink-300',
          )}
        >
          {bottom}
        </span>
      </span>
    </>
  );

  // No href yet: render the badge, but never navigate. aria-disabled tells a
  // screen reader what the greyed-out styling tells everyone else.
  if (!href) {
    return (
      <span className={shell} aria-disabled role="link">
        {inner}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        shell,
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow',
      )}
    >
      {inner}
    </a>
  );
}

export function StoreBadges({ className }: { className?: string }) {
  const live = APP_STORE_URL || PLAY_STORE_URL;

  return (
    <div className={className}>
      <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
        {live ? 'Télécharge l’appli' : 'Bientôt sur mobile'}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2.5">
        <Badge
          href={APP_STORE_URL}
          mark={<AppleMark />}
          top={APP_STORE_URL ? 'Télécharger sur' : 'Bientôt sur'}
          bottom="App Store"
        />
        <Badge
          href={PLAY_STORE_URL}
          mark={<PlayMark />}
          top={PLAY_STORE_URL ? 'Disponible sur' : 'Bientôt sur'}
          bottom="Google Play"
        />
      </div>
    </div>
  );
}
