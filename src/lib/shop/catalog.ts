/**
 * The shop catalogue.
 *
 * Data lives here rather than inside the page so the products can be replaced
 * without touching any rendering code — the same reason the store badge URLs
 * sit in one constant.
 *
 * Nothing here is purchasable yet. Prices are declared so the catalogue and the
 * pricing can be judged before payment is wired up.
 */

export type Category = 'abonnements' | 'merch' | 'promos' | 'objets';

/** Categories that hold products. `abonnements` and `promos` are not stock. */
export type ProductCategory = 'merch' | 'objets';

export type ProductIcon =
  | 'bottle'
  | 'towel'
  | 'tee'
  | 'tank'
  | 'hoodie'
  | 'shorts'
  | 'bag'
  | 'rope'
  | 'mat';

export interface Product {
  id: string;
  name: string;
  tagline: string;
  category: ProductCategory;
  /**
   * Integer cents. Not euros as a float, and not a display string: struck
   * prices and discounts need arithmetic, and 0.1 + 0.2 !== 0.3.
   */
  priceCents: number;
  /** Former price. Its presence is what puts an item in Promos. */
  wasCents?: number;
  icon: ProductIcon;
  /** Clothing only. */
  sizes?: readonly string[];
}

/** $SC earned per euro of discount. 100 $SC = 1 €. */
export const SC_PER_EURO = 100;

/**
 * A discount may never exceed this share of the item's price.
 *
 * $SC are earned by playing (25 per win), so an uncapped rate would turn match
 * results into real money and make every dedicated player cost a parcel. The
 * cap keeps the currency attractive without that.
 */
export const MAX_DISCOUNT_RATIO = 0.2;

export const TABS: readonly { id: Category; label: string }[] = [
  { id: 'abonnements', label: 'Abonnements' },
  { id: 'merch', label: 'Merch' },
  { id: 'promos', label: 'Promos' },
  { id: 'objets', label: 'Objets' },
] as const;

export const DEFAULT_CATEGORY: Category = 'abonnements';

const CLOTHING_SIZES = ['S', 'M', 'L', 'XL'] as const;

export const PRODUCTS: readonly Product[] = [
  // ---- merch: what you wear ----
  {
    id: 'tee',
    name: 'T-shirt SportzFight',
    tagline: 'Coton bio, coupe droite.',
    category: 'merch',
    priceCents: 2900,
    icon: 'tee',
    sizes: CLOTHING_SIZES,
  },
  {
    id: 'tank',
    name: 'Débardeur',
    tagline: 'Léger, sèche vite.',
    category: 'merch',
    priceCents: 2500,
    icon: 'tank',
    sizes: CLOTHING_SIZES,
  },
  {
    id: 'hoodie',
    name: 'Hoodie',
    tagline: 'Molleton épais, capuche doublée.',
    category: 'merch',
    priceCents: 4900,
    wasCents: 5900,
    icon: 'hoodie',
    sizes: CLOTHING_SIZES,
  },
  {
    id: 'shorts',
    name: 'Short d’entraînement',
    tagline: 'Poche zippée pour le téléphone.',
    category: 'merch',
    priceCents: 2700,
    icon: 'shorts',
    sizes: CLOTHING_SIZES,
  },

  // ---- objets: the gear ----
  {
    id: 'bottle',
    name: 'Gourde isotherme',
    tagline: '750 ml, inox double paroi.',
    category: 'objets',
    priceCents: 1900,
    icon: 'bottle',
  },
  {
    id: 'towel',
    name: 'Serviette de sport',
    tagline: 'Microfibre, format 100 × 50.',
    category: 'objets',
    priceCents: 1500,
    icon: 'towel',
  },
  {
    id: 'bag',
    name: 'Sac de sport',
    tagline: '35 L, compartiment chaussures.',
    category: 'objets',
    priceCents: 3500,
    icon: 'bag',
  },
  {
    id: 'rope',
    name: 'Corde à sauter',
    tagline: 'Câble acier, longueur réglable.',
    category: 'objets',
    priceCents: 1200,
    icon: 'rope',
  },
  {
    id: 'mat',
    name: 'Tapis de sol',
    tagline: '6 mm, antidérapant.',
    category: 'objets',
    priceCents: 2900,
    wasCents: 3500,
    icon: 'mat',
  },
] as const;

/**
 * The largest discount an item accepts, in cents and in $SC.
 *
 * Rounded DOWN to a whole $SC so the advertised cap can never exceed the ratio
 * once rounding is applied — 20% of 19,00 € is 380 cents, which is exactly 380
 * $SC, but an item priced at 12,99 € must not advertise 260 $SC for 2,60 €
 * when the true ceiling is 2,598 €.
 */
export function maxDiscount(priceCents: number): { cents: number; coins: number } {
  const ceiling = priceCents * MAX_DISCOUNT_RATIO;
  const coins = Math.floor((ceiling / 100) * SC_PER_EURO);
  return { coins, cents: Math.round((coins / SC_PER_EURO) * 100) };
}

/** Percentage off, for the badge on a discounted card. Rounded to an integer. */
export function discountPercent(p: Product): number | null {
  if (!p.wasCents || p.wasCents <= p.priceCents) return null;
  return Math.round(((p.wasCents - p.priceCents) / p.wasCents) * 100);
}

/**
 * The products shown under one tab.
 *
 * `promos` is a filter rather than a category: it gathers every discounted item
 * from the other tabs, so a promotion is declared once on the product itself
 * and there is no second list to keep in sync.
 */
export function productsFor(category: Category): readonly Product[] {
  if (category === 'promos') return PRODUCTS.filter((p) => discountPercent(p) !== null);
  if (category === 'abonnements') return [];
  return PRODUCTS.filter((p) => p.category === category);
}

/**
 * Read a tab from a URL parameter.
 *
 * Follows the matchmaking convention: an unknown value degrades silently to the
 * default rather than erroring, because a URL is user input.
 */
export function categoryFrom(raw: string | null | undefined): Category {
  const hit = TABS.find((t) => t.id === raw);
  return hit ? hit.id : DEFAULT_CATEGORY;
}

const EUROS = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

export const formatEuros = (cents: number): string => EUROS.format(cents / 100);
