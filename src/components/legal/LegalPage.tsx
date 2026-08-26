import type { ReactNode } from 'react';
import { LEGAL, type LegalIdentity } from '@/lib/legal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Footer } from '@/components/ui/Footer';

/**
 * Shared shell for the legal documents.
 *
 * These are server components — unlike the rest of the app — so each one can
 * export its own metadata, and so the text is in the HTML for anyone (a
 * regulator, a search engine, a reader with JavaScript off) who needs to read
 * it without running the app.
 */

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** Last revision, ISO date. Shown so a reader can tell how current this is. */
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-5 pb-16 sm:p-8">
      {/* One link home, not two identical ones as before. */}
      <PageHeader />

      <div>
        <h1 className="text-3xl font-black uppercase leading-none tracking-tighter sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-xs text-ink-500">
          Dernière mise à jour :{' '}
          {new Date(updated).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-ink-300">
        {children}
      </div>

      <Footer className="mt-6 border-t border-ink-800/60 pt-6" />
    </main>
  );
}

/** One numbered section of a legal document. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-base font-bold uppercase tracking-tight text-ink-100">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A value the operator must supply before launch.
 *
 * Rendered loudly on purpose: a placeholder that looks like real text is how a
 * site goes live claiming to be published by "[Nom]".
 */
export function Fill({
  field,
  children,
}: {
  /** Which entry of LEGAL to print. */
  field: keyof LegalIdentity;
  /** What to ask for while it is still empty. */
  children: ReactNode;
}) {
  const value = LEGAL[field];
  if (value.trim()) return <>{value}</>;

  // Loud on purpose: a placeholder that reads like prose is how a site ships
  // claiming to be published by "[Nom]".
  return (
    <mark className="rounded bg-flare-500/20 px-1.5 py-0.5 font-bold text-flare-400">
      [À COMPLÉTER : {children}]
    </mark>
  );
}
