import { describe, it, expect } from "vitest";
import { scoreDeal } from "../../src/modules/intelligence/dealScore.js";
import type { NormalizedOffer } from "../../src/modules/normalizer/normalizer.js";
import type { PriceHistoryStats } from "../../src/db/queries/priceHistory.js";

function makeOffer(overrides: Partial<NormalizedOffer> = {}): NormalizedOffer {
  return {
    title: "Nike Air Zoom Pegasus 41",
    platform: "Amazon IN",
    url: "https://example.com",
    price: 9499,
    shipping: 0,
    discount: 0,
    effectivePrice: 9499,
    inStock: true,
    sizeRequested: 9,
    sizeConfirmed: false,
    rawPosition: 1,
    ...overrides,
  };
}

function makeStats(overrides: Partial<PriceHistoryStats> = {}): PriceHistoryStats {
  return {
    platform: "Amazon IN",
    current_price: 9499,
    avg_30d: 10000,
    min_30d: 8999,
    max_30d: 11000,
    pct_vs_avg: -5.01,
    data_points: 30,
    ...overrides,
  };
}

describe("scoreDeal", () => {
  it("scores 0-10 range", () => {
    const score = scoreDeal(makeOffer(), makeStats());
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(10);
  });

  it("gives high score when price is well below avg and at 30d min", () => {
    // price = 8999 (= 30d min), avg = 11000 → 18% below avg
    const score = scoreDeal(
      makeOffer({ price: 8999, effectivePrice: 8999 }),
      makeStats({ avg_30d: 11000, min_30d: 8999, current_price: 8999 })
    );
    expect(score.score).toBeGreaterThanOrEqual(7);
    expect(score.label).toMatch(/Excellent|Good/);
  });

  it("gives low score when price is above avg", () => {
    const score = scoreDeal(
      makeOffer({ price: 11500, effectivePrice: 11500 }),
      makeStats({ avg_30d: 10000, min_30d: 8999, current_price: 11500 })
    );
    expect(score.score).toBeLessThanOrEqual(3);
    expect(score.label).toMatch(/Fair|Wait/);
  });

  it("adds discount points when discount is present", () => {
    const withDiscount = scoreDeal(
      makeOffer({ price: 8499, discount: 2500, effectivePrice: 8499 }),
      makeStats({ avg_30d: 10000, current_price: 8499 })
    );
    const withoutDiscount = scoreDeal(
      makeOffer({ price: 8499, discount: 0, effectivePrice: 8499 }),
      makeStats({ avg_30d: 10000, current_price: 8499 })
    );
    expect(withDiscount.score).toBeGreaterThan(withoutDiscount.score);
  });

  it("deducts 1 point for out-of-stock", () => {
    const inStock = scoreDeal(makeOffer({ inStock: true }), makeStats());
    const outOfStock = scoreDeal(makeOffer({ inStock: false }), makeStats());
    expect(inStock.score).toBeGreaterThan(outOfStock.score);
  });

  it("returns 0 historical points when no stats provided", () => {
    const score = scoreDeal(makeOffer(), undefined);
    // Only discount (0) + stock (1) = 1 max
    expect(score.score).toBeLessThanOrEqual(3);
    expect(score.components[0].reason).toMatch(/No historical data/);
  });

  it("includes all 4 components in output", () => {
    const score = scoreDeal(makeOffer(), makeStats());
    expect(score.components).toHaveLength(4);
    const labels = score.components.map((c) => c.label);
    expect(labels).toContain("vs 30-day avg");
    expect(labels).toContain("vs 30-day min");
    expect(labels).toContain("discount");
    expect(labels).toContain("availability");
  });

  it("summary string is non-empty", () => {
    const score = scoreDeal(makeOffer(), makeStats());
    expect(score.summary.length).toBeGreaterThan(10);
  });
});
