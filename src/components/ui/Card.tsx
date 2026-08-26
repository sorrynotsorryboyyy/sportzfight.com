import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

/**
 * The surface primitive.
 *
 * `padding` and `radius` exist because their absence was the root cause of the
 * drift: a row needing tighter padding had to bypass Card entirely, and nine
 * hand-rolled panels appeared with seven different background opacities. One
 * surface, one opacity, configurable density.
 */

const PADDING = {
  none: '',
  sm: 'px-3 py-2.5',
  md: 'p-4',
  lg: 'p-5',
} as const;

const RADIUS = {
  md: 'rounded-xl',
  lg: 'rounded-2xl',
} as const;

export function Card({
  children,
  className,
  padding = 'lg',
  radius = 'lg',
  /** Adds the lit-panel gradient. On by default; off for dense list rows. */
  sheen = true,
}: {
  /** Optional so a Card can stand in as a sized skeleton while data loads. */
  children?: ReactNode;
  className?: string;
  padding?: keyof typeof PADDING;
  radius?: keyof typeof RADIUS;
  sheen?: boolean;
}) {
  return (
    <div
      className={cn(
        sheen && 'panel-sheen',
        RADIUS[radius],
        PADDING[padding],
        'border border-ink-800 bg-ink-900/80',
        className,
      )}
    >
      {children}
    </div>
  );
}
