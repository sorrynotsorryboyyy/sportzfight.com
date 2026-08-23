'use client';

import { cn } from '@/lib/utils/cn';

/** Google's mark, inlined so it works offline and under a strict CSP. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-5 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function GoogleButton({
  onClick,
  loading = false,
  className,
}: {
  onClick: () => void;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex h-16 w-full items-center justify-center gap-3 rounded-2xl',
        'bg-white px-6 text-lg font-bold tracking-tight text-[#1f1f1f]',
        'transition-[transform,opacity] duration-150 active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow',
        className,
      )}
    >
      {loading ? (
        <span className="size-5 animate-spin rounded-full border-2 border-[#1f1f1f] border-t-transparent" />
      ) : (
        <GoogleMark />
      )}
      Continuer avec Google
    </button>
  );
}
