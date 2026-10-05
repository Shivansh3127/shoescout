import { describe, it, expect } from "vitest";
import { parseGemmaJson, validateOutput } from "../../src/modules/gemma/guardrail.js";
import type { PromptContext } from "../../src/modules/gemma/promptBuilder.js";
import type { DealScore } from "../../src/modules/intelligence/dealScore.js";

const DUMMY_DEAL_SCORE: DealScore = {
  score: 7,
  label: "Good",
  components: [],
  summary: "Good deal (7/10)",
};

function makeCtx(): PromptContext {
  return {
    friend: { name: "Sanskar", budget: 10000, size: 9, usageNotes: "Road running" },
    query: "Nike Pegasus 41",
    offers: [
      {
        platform: "Myntra",
        title: "Nike Pegasus 41",
        price: 7999,
        shipping: 0,
        discount: 2996,
        effectivePrice: 7999,
        inStock: true,
        url: "https://myntra.com/1",
        dealScore: DUMMY_DEAL_SCORE,
      },
      {
        platform: "Amazon IN",
        title: "Nike Pegasus 41",
        price: 9499,
        shipping: 0,
        discount: 1496,
        effectivePrice: 9499,
        inStock: true,
        url: "https://amazon.in/2",
        dealScore: DUMMY_DEAL_SCORE,
      },
    ],
  };
}

describe("parseGemmaJson", () => {
  it("parses clean JSON", () => {
    const raw = JSON.stringify({
      pick: "Myntra",
      effectivePrice: 7999,
      reasons: ["Cheapest"],
      tradeoffs: ["No return"],
      caveats: [],
    });
    expect(parseGemmaJson(raw)).not.toBeNull();
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"pick":"Myntra","effectivePrice":7999,"reasons":["r"],"tradeoffs":[],"caveats":[]}\n```';
    const result = parseGemmaJson(raw);
    expect(result).not.toBeNull();
    expect(result?.pick).toBe("Myntra");
  });

  it("returns null for non-JSON", () => {
    expect(parseGemmaJson("Sure! I recommend Myntra because...")).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(parseGemmaJson('{"pick":"Myntra"}')).toBeNull();
  });
});

describe("validateOutput", () => {
  it("passes valid output", () => {
    const out = { pick: "Myntra", effectivePrice: 7999, reasons: ["r"], tradeoffs: [], caveats: [] };
    const result = validateOutput(out, makeCtx());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects hallucinated platform", () => {
    const out = { pick: "Snapdeal", effectivePrice: 7999, reasons: [], tradeoffs: [], caveats: [] };
    const result = validateOutput(out, makeCtx());
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("Snapdeal"))).toBe(true);
  });

  it("rejects mismatched effectivePrice", () => {
    const out = { pick: "Myntra", effectivePrice: 5000, reasons: [], tradeoffs: [], caveats: [] };
    const result = validateOutput(out, makeCtx());
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("5000"))).toBe(true);
  });

  it("rejects fabricated price in reasons text", () => {
    const out = {
      pick: "Myntra",
      effectivePrice: 7999,
      reasons: ["At ₹6500 it is the best deal"],  // 6500 not in input
      tradeoffs: [],
      caveats: [],
    };
    const result = validateOutput(out, makeCtx());
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("6500"))).toBe(true);
  });

  it("allows prices that are in the input", () => {
    const out = {
      pick: "Myntra",
      effectivePrice: 7999,
      reasons: ["Costs ₹7999, much less than Amazon's ₹9499"],
      tradeoffs: [],
      caveats: [],
    };
    const result = validateOutput(out, makeCtx());
    expect(result.valid).toBe(true);
  });
});
