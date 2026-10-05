import { describe, it, expect } from "vitest";
import { parsePrice, tryParsePrice, parseShipping } from "../../src/modules/normalizer/priceParser.js";

describe("parsePrice", () => {
  // ── Happy paths ─────────────────────────────────────────────────────────────
  it("parses ₹ prefix with comma separator", () => {
    expect(parsePrice("₹9,499")).toBe(9499);
  });

  it("parses ₹ with paise", () => {
    expect(parsePrice("₹9,499.50")).toBe(9499.50);
  });

  it("parses Rs. prefix", () => {
    expect(parsePrice("Rs. 9,499")).toBe(9499);
  });

  it("parses Rs prefix without dot", () => {
    expect(parsePrice("Rs 10,995")).toBe(10995);
  });

  it("parses INR prefix", () => {
    expect(parsePrice("INR 9499")).toBe(9499);
  });

  it("parses plain number string", () => {
    expect(parsePrice("9499")).toBe(9499);
  });

  it("parses number string with commas only", () => {
    expect(parsePrice("9,499")).toBe(9499);
  });

  it("parses number string with extra spaces", () => {
    expect(parsePrice("  ₹ 9 499  ")).toBe(9499);
  });

  it("accepts pre-parsed number directly", () => {
    expect(parsePrice(9499.0)).toBe(9499);
  });

  it("accepts 0 (free item)", () => {
    expect(parsePrice(0)).toBe(0);
  });

  // ── Edge / error cases ──────────────────────────────────────────────────────
  it("throws on null", () => {
    expect(() => parsePrice(null)).toThrow("missing");
  });

  it("throws on undefined", () => {
    expect(() => parsePrice(undefined)).toThrow("missing");
  });

  it("throws on non-numeric string", () => {
    expect(() => parsePrice("free")).toThrow("Cannot parse");
  });

  it("throws on negative number", () => {
    expect(() => parsePrice(-100)).toThrow("Negative");
  });

  it("throws on NaN", () => {
    expect(() => parsePrice(NaN)).toThrow("Invalid numeric");
  });
});

describe("tryParsePrice", () => {
  it("returns number on valid input", () => {
    expect(tryParsePrice("₹7,999")).toBe(7999);
  });

  it("returns undefined on bad input instead of throwing", () => {
    expect(tryParsePrice("call for price")).toBeUndefined();
  });

  it("returns undefined on null", () => {
    expect(tryParsePrice(null)).toBeUndefined();
  });
});

describe("parseShipping", () => {
  it("returns 0 for FREE delivery", () => {
    expect(parseShipping("FREE delivery")).toBe(0);
  });

  it("returns 0 for 'Free'", () => {
    expect(parseShipping("Free")).toBe(0);
  });

  it("returns 0 for null/undefined", () => {
    expect(parseShipping(null)).toBe(0);
    expect(parseShipping(undefined)).toBe(0);
  });

  it("parses ₹49 delivery", () => {
    expect(parseShipping("₹49 delivery")).toBe(49);
  });

  it("parses 'Delivery: ₹99'", () => {
    expect(parseShipping("Delivery: ₹99")).toBe(99);
  });

  it("returns 0 for unrecognised strings", () => {
    expect(parseShipping("Ships from seller")).toBe(0);
  });
});
