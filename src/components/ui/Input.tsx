import { cn } from '@/lib/utils/cn';

/**
 * A text field.
 *
 * The project had none: the only input in the app is hand-rolled inside
 * UsernameEditor. Its `focus:` ring is kept here rather than `focus-visible:`
 * — a text field should show focus when clicked, unlike a button.
 */
export function Input({
  label,
  hint,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  const inputId = id ?? `in-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="block text-3xs font-bold uppercase tracking-widest text-ink-500"
      >
        {label}
      </label>
      <input
        id={inputId}
        {...props}
        className={cn(
          'mt-1 h-11 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 text-sm text-ink-100',
          'placeholder:text-ink-600',
          'focus:border-cyan-glow focus:outline-none focus:ring-2 focus:ring-cyan-glow/40',
          'disabled:opacity-50',
        )}
      />
      {hint && <p className="mt-1 text-3xs text-ink-600">{hint}</p>}
    </div>
  );
}
