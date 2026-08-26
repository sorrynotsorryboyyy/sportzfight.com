import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Card } from './Card';

/**
 * What a list shows when it has nothing.
 *
 * Five hand-written variants existed, two of them describing the identical
 * "leaderboard is empty" condition in different words. An empty state is the
 * first thing a new player sees, so it deserves one voice.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
  icon?: ReactNode;
}) {
  return (
    <Card className="text-center">
      {icon && <div className="mb-3 flex justify-center text-ink-600">{icon}</div>}
      <p className="text-sm font-semibold text-ink-200">{title}</p>
      {body && <p className="mt-1 text-xs leading-relaxed text-ink-500">{body}</p>}
      {action && (
        <Link href={action.href} className="mt-4 block">
          <Button size="md">{action.label}</Button>
        </Link>
      )}
    </Card>
  );
}
