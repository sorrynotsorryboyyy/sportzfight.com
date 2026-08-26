import { describe, expect, it } from 'vitest';
import {
  categoryFrom,
  DEFAULT_CATEGORY,
  discountPercent,
  formatEuros,
  maxDiscount,
  MAX_DISCOUNT_RATIO,
  PRODUCTS,
  productsFor,
  SC_PER_EURO,
  TABS,
} from '../src/lib/shop/catalog';

describe('the $SC discount cap', () => {
  it('never exceeds the ratio, for every product in the catalogue', () => {
    // The promise printed on each card. Rounding must not be able to break it.
    for (const p of PRODUCTS) {
      const { cents } = maxDiscount(p.priceCents);
      expect(cents).toBeLessThanOrEqual(p.priceCents * MAX_DISCOUNT_RATIO);
    }
  });

  it('never exceeds the ratio at any price from 1 cent to 500 €', () => {
    for (let price = 1; price <= 50_000; price += 7) {
      const { cents, coins } = maxDiscount(price);
      expect(cents).toBeLessThanOrEqual(price * MAX_DISCOUNT_RATIO);
      expect(coins).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(coins)).toBe(true);
    }
  });

  it('keeps cents and coins consistent with the exchange rate', () => {
    const { cents, coins } = maxDiscount(1900);
    expect(coins).toBe(380);
    expect(cents).toBe(380);
    expect(cents / 100).toBeCloseTo(coins / SC_PER_EURO, 10);
  });

  it('floors to a whole $SC rather than rounding up', () => {
    // 20% of 12,99 € is 2,598 €, i.e. 259.8 $SC. Advertising 260 would promise
    // a discount fractionally larger than the cap.
    expect(maxDiscount(1299).coins).toBe(259);
  });

  it('gives no discount on a free item', () => {
    expect(maxDiscount(0)).toEqual({ cents: 0, coins: 0 });
  });
});

describe('discount percentage', () => {
  it('computes the reduction off the former price', () => {
    expect(discountPercent({ ...PRODUCTS[0], priceCents: 4900, wasCents: 5900 })).toBe(17);
  });

  it('is null without a former price', () => {
    const plain = { ...PRODUCTS[0] };
    delete plain.wasCents;
    expect(discountPercent(plain)).toBeNull();
  });

  it('is null when the former price is not actually higher', () => {
    expect(discountPercent({ ...PRODUCTS[0], priceCents: 2900, wasCents: 2900 })).toBeNull();
    expect(discountPercent({ ...PRODUCTS[0], priceCents: 2900, wasCents: 1900 })).toBeNull();
  });
});

describe('tab contents', () => {
  it('puts every discounted item in Promos, and nothing else', () => {
    const promos = productsFor('promos');
    const discounted = PRODUCTS.filter((p) => p.wasCents !== undefined);
    expect(promos.map((p) => p.id).sort()).toEqual(discounted.map((p) => p.id).sort());
    expect(promos.length).toBeGreaterThan(0);
  });

  it('draws Promos from more than one category', () => {
    // Promos is a filter, not a category: an item is discounted once, on
    // itself, and shows up in both its own tab and Promos.
    const cats = new Set(productsFor('promos').map((p) => p.category));
    expect(cats.size).toBeGreaterThan(1);
  });

  it('keeps a promoted item in its own category too', () => {
    for (const p of productsFor('promos')) {
      expect(productsFor(p.category).map((x) => x.id)).toContain(p.id);
    }
  });

  it('separates clothing from gear', () => {
    expect(productsFor('merch').every((p) => p.category === 'merch')).toBe(true);
    expect(productsFor('objets').every((p) => p.category === 'objets')).toBe(true);
    expect(productsFor('merch').length).toBeGreaterThan(0);
    expect(productsFor('objets').length).toBeGreaterThan(0);
  });

  it('holds no products under Abonnements', () => {
    expect(productsFor('abonnements')).toHaveLength(0);
  });

  it('accounts for every product in exactly one goods tab', () => {
    const merch = productsFor('merch').length;
    const objets = productsFor('objets').length;
    expect(merch + objets).toBe(PRODUCTS.length);
  });
});

describe('reading the tab from the URL', () => {
  it('accepts every declared tab', () => {
    for (const t of TABS) expect(categoryFrom(t.id)).toBe(t.id);
  });

  it('falls back to the default on anything unknown', () => {
    for (const bad of ['', 'nope', 'MERCH', '../etc', null, undefined]) {
      expect(categoryFrom(bad)).toBe(DEFAULT_CATEGORY);
    }
  });
});

describe('catalogue integrity', () => {
  it('has unique product ids', () => {
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices everything in whole positive cents', () => {
    for (const p of PRODUCTS) {
      expect(Number.isInteger(p.priceCents)).toBe(true);
      expect(p.priceCents).toBeGreaterThan(0);
    }
  });

  it('only gives sizes to clothing', () => {
    for (const p of PRODUCTS) {
      if (p.sizes) expect(p.category).toBe('merch');
    }
  });
});

describe('price formatting', () => {
  it('renders cents as French euros', () => {
    // Non-breaking spaces vary by ICU build; compare on the digits.
    expect(formatEuros(1900).replace(/\s/g, ' ')).toBe('19,00 €');
    expect(formatEuros(0).replace(/\s/g, ' ')).toBe('0,00 €');
  });
});
