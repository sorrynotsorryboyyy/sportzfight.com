import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

/**
 * The landing's top bar.
 *
 * The page is a single fold now, so this no longer tracks scroll position: it
 * simply sits at the top with a permanent hairline. The old "transparent until
 * scrolled" treatment existed for a long page and could never trigger here.
 *
 * The links point at real pages rather than anchors — the sections they used to
 * jump to are gone.
 */

const LINKS = [
  { href: '/classement', label: 'Classement' },
  { href: '/boutique', label: 'Boutique' },
] as const;

export function LandingNav() {
  return (
    <header className="shrink-0 border-b border-ink-800/60">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="SportzFight, accueil">
          <Logo className="text-xl" />
        </Link>

        {/* Two links do not justify a burger menu; they simply hide on mobile. */}
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-ink-300 transition-colors hover:text-ink-100"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <Link
          href="/login"
          className="rounded-xl bg-volt-500 px-4 py-2 text-sm font-black uppercase tracking-tight text-ink-950 transition-colors hover:bg-volt-400"
        >
          Commencer
        </Link>
      </nav>
    </header>
  );
}
