import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * A small status label.
 *
 * Six variants of this existed, including the $SC balance rendered with
 * different padding on two different pages. One component, one geometry.
 */

const TONE = {
  gold: 'bg-gold/10 text-gold',
  volt: 'bg-volt-500/15 text-volt-500',
  flare: 'bg-flare-500/15 text-flare-400',
  cyan: 'bg-cyan-glow/15 text-cyan-glow',
  muted: 'bg-ink-800 text-ink-400',
  solid: 'bg-volt-500 text-ink-950',
} as const;

const SIZE = {
  sm: 'px-2 py-0.5 text-3xs',
  md: 'px-2.5 py-1 text-xs',
} as const;

export function Pill({
  children,
  tone = 'muted',
  size = 'sm',
  className,
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full font-black uppercase tracking-widest',
        TONE[tone],
        SIZE[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
