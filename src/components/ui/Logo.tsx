import { cn } from '@/lib/utils/cn';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'font-black uppercase tracking-tighter leading-none select-none',
        className,
      )}
    >
      <span className="text-ink-100">SPORTZ</span>
      <span className="text-volt-500">FIGHT</span>
    </span>
  );
}
