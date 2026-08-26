import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * A data table for the admin dashboard.
 *
 * Deliberately thin — no sorting engine, no virtualisation, no column
 * resizing. It exists so the dashboard's several tables look like each other,
 * and so the horizontal-scroll wrapper is written once rather than forgotten
 * on the one table that overflows a phone.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align numbers so digits line up down the column. */
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  empty = 'Rien à afficher.',
  className,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  empty?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-ink-800 bg-ink-900/60 p-4 text-center text-xs text-ink-500">
        {empty}
      </p>
    );
  }

  return (
    // A table always outgrows a phone; scrolling the table beats scrolling the
    // page sideways.
    <div className={cn('overflow-x-auto rounded-xl border border-ink-800', className)}>
      <table className="w-full min-w-max text-left text-xs">
        <thead>
          <tr className="border-b border-ink-800 bg-ink-900/60">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-3 py-2 text-3xs font-bold uppercase tracking-widest text-ink-500',
                  c.numeric && 'text-right',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-ink-800/60 transition-colors last:border-0 hover:bg-ink-900/60"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'whitespace-nowrap px-3 py-2.5 text-ink-300',
                    c.numeric && 'tnum text-right',
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cents to a French euro string. Used across the dashboard. */
export const euros = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
