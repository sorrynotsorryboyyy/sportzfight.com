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
  error,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  /** Shown in place of the hint, and announced to assistive tech. */
  error?: string | null;
}) {
  const inputId = id ?? `in-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const noteId = `${inputId}-note`;

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
        aria-invalid={error ? true : undefined}
        // Points at whichever note is rendered, so a screen reader hears the
        // error rather than only seeing red.
        aria-describedby={error || hint ? noteId : undefined}
        {...props}
        className={cn(
          'mt-1 h-11 w-full rounded-xl border bg-ink-850 px-3 text-sm text-ink-100',
          'placeholder:text-ink-600',
          'focus:outline-none focus:ring-2',
          error
            ? 'border-flare-500 focus:border-flare-400 focus:ring-flare-500/40'
            : 'border-ink-700 focus:border-cyan-glow focus:ring-cyan-glow/40',
          'disabled:opacity-50',
        )}
      />
      {(error || hint) && (
        <p
          id={noteId}
          role={error ? 'alert' : undefined}
          className={cn('mt-1 text-3xs', error ? 'text-flare-400' : 'text-ink-600')}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
