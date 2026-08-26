import { cn } from '@/lib/utils/cn';

/**
 * A choice among a handful of options, rendered as buttons rather than a
 * native <select>.
 *
 * A dropdown on a phone opens an OS sheet and hides the alternatives; with
 * three or four options, showing them all is faster and communicates the scale
 * of the question. Everything here is optional, so there is always a way to
 * unset: tapping the current choice clears it.
 */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
  className,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  hint?: string;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="text-3xs font-bold uppercase tracking-widest text-ink-500">
        {label}
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              // Tapping the active option clears it: these are optional and a
              // one-way choice would trap someone who mis-tapped.
              onClick={() => onChange(on ? undefined : o.id)}
              className={cn(
                'focus-ring rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                on
                  ? 'border-volt-500 bg-volt-500/10 text-volt-500'
                  : 'border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-3xs text-ink-600">{hint}</p>}
    </fieldset>
  );
}
