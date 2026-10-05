/**
 * Prompt builder for the Gemma recommendation.
 *
 * Passes ONLY structured JSON to the model — no free-text
 * that could introduce hallucinated data. The system prompt
 * instructs Gemma to return a strict JSON object and to
 * reference only the data provided.
 */

import type { SearchResultOffer } from "../search/searchService.js";
import type { DealScore } from "../intelligence/dealScore.js";

export interface FriendProfile {
  name: string;
  budget: number;
  size: number;
  usageNotes: string;
}

export interface PromptContext {
  friend: FriendProfile;
  offers: Array<{
    platform: string;
    price: number;
    shipping: number;
    discount: number;
    effectivePrice: number;
    inStock: boolean;
    url: string;
    title: string;
    dealScore: DealScore;
  }>;
  query: string;
}

const SYSTEM_PROMPT = `You are ShoeScout, a deal advisor. Your job is to recommend the single best shoe offer from the data provided.

RULES:
1. Only reference platforms, prices, and numbers that appear in the JSON input. Never invent data.
2. Be honest about limitations — if deal scores are based on limited history, say so.
3. Return ONLY a valid JSON object. No markdown fences, no preamble, no explanation outside the JSON.

Required output format:
{
  "pick": "<platform name exactly as given>",
  "effectivePrice": <number — must match input>,
  "reasons": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "tradeoffs": ["<tradeoff 1>"],
  "caveats": ["<caveat 1>"]
}`;

export function buildPrompt(ctx: PromptContext): string {
  // Trim offers to top 5 by effectivePrice to keep prompt short
  const topOffers = [...ctx.offers]
    .sort((a, b) => a.effectivePrice - b.effectivePrice)
    .slice(0, 5)
    .map((o) => ({
      platform: o.platform,
      title: o.title,
      price_inr: o.price,
      shipping_inr: o.shipping,
      discount_inr: o.discount,
      effective_price_inr: o.effectivePrice,
      in_stock: o.inStock,
      deal_score: o.dealScore.score,
      deal_label: o.dealScore.label,
      deal_summary: o.dealScore.summary,
      url: o.url,
    }));

  const data = {
    friend: {
      name: ctx.friend.name,
      budget_inr: ctx.friend.budget,
      uk_size: ctx.friend.size,
      usage_notes: ctx.friend.usageNotes,
    },
    search_query: ctx.query,
    offers: topOffers,
    instructions:
      "Pick the single best offer for this person. Justify with real numbers from the data above.",
  };

  return JSON.stringify(data, null, 2);
}

export { SYSTEM_PROMPT };
