import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { cn } from '@/lib/utils/cn';

/**
 * Every page's top bar.
 *
 * Seven variants existed across nine pages: the logo was sometimes a link and
 * sometimes not, at four different sizes, with six different right-hand
 * affordances. That inconsistency is most of why the app read as assembled
 * rather than designed.
 *
 * The logo is ALWAYS a link here. Two pages had it inert — the hub (harmless,
 * already home) and the spectator lobby, where it was the only thing on screen
 * and left that page with no way out at all.
 */
export function PageHeader({
  /** Shown under the logo. Omit on pages whose h1 already says it. */
  title,
  /** Right-hand slot: a link, a pill, a button. */
  action,
  className,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-center justify-between gap-3 py-1', className)}>
      <div className="min-w-0">
        <Link
          href="/"
          aria-label="SportzFight, accueil"
          className="focus-ring inline-block"
        >
          <Logo className="text-xl" />
        </Link>
        {title && (
          <p className="mt-0.5 truncate text-3xs font-bold uppercase tracking-widest text-ink-500">
            {title}
          </p>
        )}
      </div>

      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
