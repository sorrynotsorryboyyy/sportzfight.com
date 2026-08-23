'use client';

import { cn } from '@/lib/utils/cn';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'xl';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-volt-500 text-ink-950 hover:bg-volt-400 active:bg-volt-600 font-black',
  secondary:
    'bg-ink-800 text-ink-100 hover:bg-ink-700 active:bg-ink-600 border border-ink-700',
  ghost: 'bg-transparent text-ink-300 hover:text-ink-100 hover:bg-ink-850',
  danger: 'bg-flare-500 text-white hover:bg-flare-400 active:bg-flare-600 font-bold',
};

// Generous hit areas: these get tapped with shaking hands mid-effort.
const SIZES: Record<Size, string> = {
  md: 'h-12 px-5 text-base rounded-xl',
  lg: 'h-14 px-6 text-lg rounded-2xl',
  xl: 'h-16 px-8 text-xl rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex w-full items-center justify-center gap-2 tracking-tight',
        'transition-[transform,background-color,opacity] duration-150',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
