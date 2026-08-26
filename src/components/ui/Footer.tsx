import Link from 'next/link';

/**
 * Legal footer.
 *
 * A legal notice nobody can reach does not satisfy anything: French law
 * requires mentions légales to be accessible from every page, and the GDPR
 * notice has to be findable before someone signs up. So this sits on every
 * page rather than only on the landing.
 */

const LINKS = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/cgu', label: 'CGU' },
] as const;

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={className}>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[0.7rem] text-ink-500">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="transition-colors hover:text-ink-300"
          >
            {l.label}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-center text-[0.65rem] text-ink-600">
        SportzFight — le sport sans excuse
      </p>
    </footer>
  );
}
