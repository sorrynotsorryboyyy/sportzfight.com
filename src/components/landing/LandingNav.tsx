import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

/**
 * The landing's top bar.
 *
 * The page is a single fold, so this does not track scroll position: it sits at
 * the top with a permanent hairline.
 *
 * Deliberately down to one action. It used to carry Classement and Boutique
 * links, but neither means much to someone without an account — a shop they
 * cannot buy from yet and a ranking they are not in. One button converts
 * better than three ways to wander off.
 */
export function LandingNav() {
  return (
    <header className="shrink-0 border-b border-ink-800/60">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="SportzFight, accueil" className="focus-ring">
          <Logo className="text-xl" />
        </Link>

        <Link
          href="/login"
          className="focus-ring rounded-xl bg-volt-500 px-4 py-2 text-sm font-black uppercase tracking-tight text-ink-950 transition-colors hover:bg-volt-400"
        >
          Commencer
        </Link>
      </nav>
    </header>
  );
}
