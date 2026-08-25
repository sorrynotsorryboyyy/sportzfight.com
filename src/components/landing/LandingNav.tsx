'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/utils/cn';

/**
 * The landing's top bar.
 *
 * Sticky rather than static: it keeps the sign-in action reachable at any
 * scroll depth, which is what lets the mobile floating button stand down on
 * desktop instead of hovering over a 1440px page like a mis-ported app.
 *
 * The blurred background only appears once scrolled — over the hero it would
 * be a horizontal line across an otherwise full-bleed image.
 */

const LINKS = [
  { href: '#comment', label: 'Comment ça marche' },
  { href: '#classement', label: 'Classement' },
] as const;

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-ink-800/80 bg-ink-950/85 backdrop-blur'
          : 'border-b border-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="SportzFight, accueil">
          <Logo className="text-xl" />
        </Link>

        {/* Two links do not justify a burger menu; they simply hide on mobile. */}
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-ink-300 transition-colors hover:text-ink-100"
            >
              {l.label}
            </a>
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
