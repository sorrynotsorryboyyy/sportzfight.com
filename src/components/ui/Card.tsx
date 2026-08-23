import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'panel-sheen rounded-2xl border border-ink-800 bg-ink-900/80 p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
