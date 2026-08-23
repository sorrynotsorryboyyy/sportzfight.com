'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * The share step. Getting the opponent in is the biggest drop-off point, so
 * offer the native share sheet first (one tap on mobile) and fall back to
 * copy-to-clipboard.
 */
export function ShareCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<false | 'code' | 'link'>(false);

  const link =
    typeof window !== 'undefined'
      ? `${window.location.origin}/battle/join?code=${code}`
      : '';

  async function copy(text: string, what: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the code is on screen to read out anyway */
    }
  }

  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'SportzFight',
          text: `Affronte-moi sur SportzFight ! Code : ${code}`,
          url: link,
        });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    void copy(link, 'link');
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="w-full">
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-ink-400">
          Code du battle
        </p>
        <button
          onClick={() => void copy(code, 'code')}
          className="tnum w-full rounded-2xl border-2 border-dashed border-ink-700 bg-ink-900 py-6 text-center text-5xl font-black tracking-[0.25em] text-volt-500 transition-colors hover:border-volt-500 sm:text-6xl"
          aria-label={`Copier le code ${code}`}
        >
          {code}
        </button>
        <p className="mt-2 h-5 text-center text-sm text-volt-400">
          {copied === 'code' && 'Code copié !'}
          {copied === 'link' && 'Lien copié !'}
        </p>
      </div>

      <Button onClick={() => void share()} size="xl">
        PARTAGER LE CODE
      </Button>
    </div>
  );
}
