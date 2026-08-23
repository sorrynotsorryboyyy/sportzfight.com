export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-ink-400">
      <span className="size-8 animate-spin rounded-full border-2 border-ink-700 border-t-volt-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
