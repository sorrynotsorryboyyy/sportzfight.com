'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * A segmented tab strip.
 *
 * NOT USED TODAY: its only caller was the shop, which no longer has categories.
 * Kept as a primitive — the ARIA keyboard handling is the hard part and it is
 * already done and reviewed.
 *
 * The first tabs component in the project, so it borrows the active-state
 * vocabulary already established by BottomNav: volt for the current item, muted
 * ink otherwise, and a cyan focus ring.
 *
 * Keyboard behaviour follows the ARIA tabs pattern: one stop in the tab order,
 * arrows to move between tabs. Without that, a strip of buttons forces a
 * keyboard user through every option to reach the panel.
 */

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  label,
  className,
}: {
  items: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Accessible name for the strip, e.g. "Catégories de la boutique". */
  label: string;
  className?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();

    const i = items.findIndex((t) => t.id === active);
    // Wraps around: the strip is short, and stopping at the ends is a dead end.
    const next = items[(i + delta + items.length) % items.length];
    onChange(next.id);

    // Move focus with the selection, so the next arrow press continues from
    // the tab the user is now on.
    strip.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)
      ?.focus();
  };

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      // Scrolls rather than squeezing: four labels do not fit a narrow phone,
      // and shrinking them to fit makes every one of them hard to read.
      className={cn(
        'flex gap-1 overflow-x-auto rounded-2xl border border-ink-800 bg-ink-900/60 p-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={on}
            // Only the active tab is in the tab order; arrows reach the rest.
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              'shrink-0 flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow',
              on
                ? 'bg-volt-500 text-ink-950'
                : 'text-ink-400 hover:bg-ink-850 hover:text-ink-200',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
