import { Card } from '@/components/ui/Card';
import {
  discountPercent,
  formatEuros,
  maxDiscount,
  type Product,
} from '@/lib/shop/catalog';
import { weeksToEarn } from '@/lib/shop/pace';
import { ProductMark } from './ProductIcons';

/**
 * One item in the shop grid.
 *
 * NOT RENDERED TODAY. The shop shows subscriptions only, because there is no
 * stock, no supplier and no shipping — a grid of unbuyable goods is worse than
 * no grid. Kept, with lib/shop/catalog.ts, for the day that changes.
 *
 * Nothing is purchasable, and the card says so rather than implying otherwise:
 * the action is a disabled button, exactly like the subscription cards and the
 * store badges on the landing.
 */
export function ProductCard({ product }: { product: Product }) {
  const off = discountPercent(product);
  const cap = maxDiscount(product.priceCents);

  return (
    <Card className="relative flex flex-col p-4">
      {off !== null && (
        <span className="absolute right-3 top-3 rounded-full bg-flare-500 px-2 py-0.5 text-3xs font-black uppercase tracking-widest text-white">
          −{off} %
        </span>
      )}

      <div className="grid h-20 place-items-center rounded-xl bg-ink-950/50 text-ink-300">
        <ProductMark icon={product.icon} className="size-10" />
      </div>

      <h3 className="mt-3 text-sm font-bold leading-tight text-ink-100">
        {product.name}
      </h3>
      <p className="mt-1 text-xs leading-snug text-ink-400">{product.tagline}</p>

      <div className="mt-3 flex flex-1 flex-col justify-end">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="tnum text-xl font-black leading-none text-ink-100">
            {formatEuros(product.priceCents)}
          </span>
          {product.wasCents && (
            <span className="tnum text-xs text-ink-500 line-through">
              {formatEuros(product.wasCents)}
            </span>
          )}
        </p>

        <p className="mt-1.5 text-2xs leading-snug text-gold">
          Jusqu’à −{formatEuros(cap.cents)} avec {cap.coins} $SC
        </p>
        <p className="mt-0.5 text-3xs leading-snug text-ink-500">
          ≈ {weeksToEarn(cap.coins)} en jouant tous les jours
        </p>

        {product.sizes && (
          <p className="mt-2 text-2xs text-ink-500">
            {product.sizes.join(' · ')}
          </p>
        )}

        <button
          type="button"
          disabled
          className="mt-3 h-10 w-full cursor-not-allowed rounded-xl border border-ink-700 bg-ink-850 text-xs font-bold uppercase tracking-widest text-ink-500"
        >
          Bientôt
        </button>
      </div>
    </Card>
  );
}
