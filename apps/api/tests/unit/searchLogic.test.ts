/**
 * Unit tests for effective-price sorting and budget filtering.
 * These are pure-function tests — no DB, no SerpApi, no Ollama.
 * The search service is tested via the normalizer (already covered) +
 * the sorting/filtering logic extracted here for clarity.
 */

import { describe, it, expect } from "vitest";
import { normalizeResults } from "../../src/modules/normalizer/normalizer.js";
import type { SerpApiShoppingResult } from "../../src/modules/serp/serpTypes.js";

function makeResult(
  source: string,
  extracted_price: number,
  overrides: Partial<SerpApiShoppingResult> = {}
): SerpApiShoppingResult {
  return {
    position: 1,
    title: "Nike Air Zoom Pegasus 41 UK 9",
    link: `https://example.com/${source}`,
    source,
    extracted_price,
    delivery: "FREE delivery",
    ...overrides,
  };
}

// ── Effective price = price + shipping - discount ─────────────────────────────

describe("effective price computation (integration)", () => {
  it("ranks Myntra (7999 free) above Flipkart (9299 + ₹49)", () => {
    const offers = normalizeResults([
      makeResult("Flipkart", 9299, { delivery: "₹49 delivery" }),
      makeResult("Myntra",   7999, { delivery: "FREE delivery" }),
    ]);
    expect(offers[0].platform).toBe("Myntra");
    expect(offers[0].effectivePrice).toBe(7999);
    expect(offers[1].effectivePrice).toBe(9348);
  });

  it("discount from old_price moves a result up", () => {
    const offers = normalizeResults([
      makeResult("Amazon",  9499, { extracted_old_price: 10995 }),
      makeResult("Nike",   10995),
    ]);
    // Amazon: effective = 9499 + 0 - 1496 = 8003
    expect(offers[0].platform).toBe("Amazon");
    expect(offers[0].discount).toBe(1496);
    expect(offers[0].effectivePrice).toBe(8003);
  });

  it("ignores old_price when it is less than current price", () => {
    const offers = normalizeResults([
      makeResult("Shady", 9000, { extracted_old_price: 8000 }),
    ]);
    expect(offers[0].discount).toBe(0);
    expect(offers[0].effectivePrice).toBe(9000);
  });
});

// ── Budget filtering (simulated at service layer) ─────────────────────────────

describe("budget filtering", () => {
  function filterByBudget<T extends { effectivePrice: number }>(
    offers: T[],
    budget: number
  ): T[] {
    return offers.filter((o) => o.effectivePrice <= budget);
  }

  it("excludes offers above budget", () => {
    const offers = normalizeResults([
      makeResult("Amazon",  9499),
      makeResult("Myntra",  7999),
      makeResult("Nike",   10995),
    ]);
    const filtered = filterByBudget(offers, 10000);
    expect(filtered.map((o) => o.platform)).toEqual(["Myntra", "Amazon"]);
    expect(filtered.every((o) => o.effectivePrice <= 10000)).toBe(true);
  });

  it("returns all offers when no budget limit", () => {
    const offers = normalizeResults([
      makeResult("Amazon",  9499),
      makeResult("Myntra",  7999),
      makeResult("Nike",   10995),
    ]);
    expect(offers).toHaveLength(3);
  });

  it("returns empty array when all offers exceed budget", () => {
    const offers = normalizeResults([
      makeResult("Amazon", 9499),
      makeResult("Nike",  10995),
    ]);
    const filtered = filterByBudget(offers, 5000);
    expect(filtered).toHaveLength(0);
  });
});

// ── Response shape ─────────────────────────────────────────────────────────────

describe("normalized offer fields", () => {
  it("every offer has required response fields", () => {
    const offers = normalizeResults([makeResult("Amazon", 9499)]);
    const offer = offers[0];
    expect(offer).toHaveProperty("title");
    expect(offer).toHaveProperty("platform");
    expect(offer).toHaveProperty("url");
    expect(offer).toHaveProperty("price");
    expect(offer).toHaveProperty("shipping");
    expect(offer).toHaveProperty("discount");
    expect(offer).toHaveProperty("effectivePrice");
    expect(offer).toHaveProperty("inStock");
    expect(offer).toHaveProperty("sizeRequested");
    expect(offer).toHaveProperty("sizeConfirmed");
  });
});
