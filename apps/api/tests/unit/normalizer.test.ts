import { describe, it, expect } from "vitest";
import { normalizeResults } from "../../src/modules/normalizer/normalizer.js";
import type { SerpApiShoppingResult } from "../../src/modules/serp/serpTypes.js";

// Helper to build a minimal SerpApi result
function makeResult(overrides: Partial<SerpApiShoppingResult>): SerpApiShoppingResult {
  return {
    position: 1,
    title: "Nike Air Zoom Pegasus 41 Men UK 9",
    link: "https://example.com",
    source: "Amazon IN",
    extracted_price: 9499,
    delivery: "FREE delivery",
    ...overrides,
  };
}

describe("normalizeResults — effective price", () => {
  it("effective_price = price when shipping=0 and discount=0", () => {
    const [offer] = normalizeResults([makeResult({ extracted_price: 9499, delivery: "FREE delivery" })]);
    expect(offer.effectivePrice).toBe(9499);
    expect(offer.shipping).toBe(0);
    expect(offer.discount).toBe(0);
  });

  it("adds shipping to effective price", () => {
    const [offer] = normalizeResults([makeResult({ extracted_price: 9299, delivery: "₹49 delivery" })]);
    expect(offer.effectivePrice).toBe(9348);
    expect(offer.shipping).toBe(49);
  });

  it("subtracts discount inferred from old_price", () => {
    const [offer] = normalizeResults([
      makeResult({
        extracted_price: 7999,
        extracted_old_price: 10995,
        delivery: "FREE delivery",
      }),
    ]);
    expect(offer.discount).toBe(2996);
    expect(offer.effectivePrice).toBe(5003);
  });

  it("does not create negative effective price", () => {
    // Weird data: discount larger than price
    const [offer] = normalizeResults([
      makeResult({ extracted_price: 100, extracted_old_price: 50, delivery: "FREE delivery" }),
    ]);
    // old_price < price → discount stays 0
    expect(offer.discount).toBe(0);
    expect(offer.effectivePrice).toBe(100);
  });

  it("sorts results by effective price ascending", () => {
    const results = normalizeResults([
      makeResult({ extracted_price: 9499, position: 1, source: "Amazon" }),
      makeResult({ extracted_price: 7999, position: 2, source: "Myntra" }),
      makeResult({ extracted_price: 9299, delivery: "₹49 delivery", position: 3, source: "Flipkart" }),
    ]);
    expect(results[0].platform).toBe("Myntra");         // 7999
    expect(results[1].platform).toBe("Flipkart");       // 9348
    expect(results[2].platform).toBe("Amazon");         // 9499
  });
});

describe("normalizeResults — size detection", () => {
  it("marks sizeConfirmed=true when UK size in title", () => {
    const [offer] = normalizeResults(
      [makeResult({ title: "Nike Pegasus 41 UK 9 Men" })],
      { requestedSize: 9 }
    );
    expect(offer.sizeRequested).toBe(9);
    expect(offer.sizeConfirmed).toBe(true);
  });

  it("marks sizeConfirmed=false when title has wrong size", () => {
    const [offer] = normalizeResults(
      [makeResult({ title: "Nike Pegasus 41 UK 10 Men" })],
      { requestedSize: 9 }
    );
    expect(offer.sizeConfirmed).toBe(false);
  });

  it("marks sizeRequested=unknown when no size passed", () => {
    const [offer] = normalizeResults([makeResult({})]);
    expect(offer.sizeRequested).toBe("unknown");
    expect(offer.sizeConfirmed).toBe(false);
  });
});

describe("normalizeResults — stock detection", () => {
  it("marks out of stock when delivery contains 'Out of stock'", () => {
    const [offer] = normalizeResults([makeResult({ delivery: "Out of stock" })]);
    expect(offer.inStock).toBe(false);
  });

  it("marks in stock for normal delivery", () => {
    const [offer] = normalizeResults([makeResult({ delivery: "FREE delivery" })]);
    expect(offer.inStock).toBe(true);
  });
});

describe("normalizeResults — bad data", () => {
  it("skips results with no parseable price", () => {
    const results = normalizeResults([
      makeResult({ extracted_price: undefined, price: "call for price" }),
      makeResult({ extracted_price: 9499 }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].price).toBe(9499);
  });
});
