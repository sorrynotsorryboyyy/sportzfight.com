import { cn } from '@/lib/utils/cn';

/**
 * A player's picture, or their initial when there is none.
 *
 * One implementation replacing three that had drifted apart — the podium's,
 * the account page's, and the opponent bar's, each with its own fallback
 * behaviour and the same eslint-disable pasted in.
 *
 * next/image is deliberately not used: Google avatar URLs are remote and would
 * need remote-pattern config in next.config.ts for no benefit, since these are
 * already small and served from a CDN.
 */
export function Avatar({
  src,
  name,
  size = 32,
  ring,
  className,
}: {
  src: string | null | undefined;
  /** Used for the fallback initial and the accessible label. */
  name: string;
  size?: number;
  /** Optional ring colour class, e.g. for podium medals. */
  ring?: string;
  className?: string;
}) {
  const shared = cn(
    'shrink-0 rounded-full object-cover',
    ring ? `ring-2 ${ring} ring-offset-2 ring-offset-ink-950` : 'border border-ink-700',
    className,
  );
  const style = { width: size, height: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={style}
        // Google 403s avatar requests that carry a referrer from another origin.
        referrerPolicy="no-referrer"
        className={shared}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.round(size * 0.42) }}
      className={cn(
        shared,
        'grid place-items-center bg-ink-800 font-black uppercase text-ink-400',
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
