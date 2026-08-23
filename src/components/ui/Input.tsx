'use client';

import { cn } from '@/lib/utils/cn';
import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, className, id, ...rest }: Props) {
  const inputId = id ?? rest.name;
  return (
    <label className="block" htmlFor={inputId}>
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-ink-400">
          {label}
        </span>
      )}
      <input
        id={inputId}
        {...rest}
        aria-invalid={!!error}
        className={cn(
          'h-14 w-full rounded-xl border bg-ink-850 px-4 text-base text-ink-100',
          'placeholder:text-ink-600',
          'focus:outline-none focus:ring-2 focus:ring-cyan-glow/70',
          error ? 'border-flare-500' : 'border-ink-700',
          className,
        )}
      />
      {error && <span className="mt-1.5 block text-sm text-flare-400">{error}</span>}
    </label>
  );
}
