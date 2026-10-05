/**
 * Gemma output guardrail.
 *
 * After generation, validates that every price, platform, and number
 * in the output exists in the input data. If anything doesn't match,
 * returns a list of violations so the caller can retry or fall back.
 *
 * This is the safety layer that keeps the AI honest.
 */

import { logger } from "../../config/logger.js";
import type { PromptContext } from "./promptBuilder.js";

export interface GemmaOutput {
  pick: string;
  effectivePrice: number;
  reasons: string[];
  tradeoffs: string[];
  caveats: string[];
}

export interface GuardrailResult {
  valid: boolean;
  violations: string[];
  output?: GemmaOutput;
}

/**
 * Parse the raw text from Gemma into a typed object.
 * Strips markdown code fences if the model ignores the instruction.
 */
export function parseGemmaJson(raw: string): GemmaOutput | null {
  // Strip ```json ... ``` fences if present
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(stripped) as Partial<GemmaOutput>;

    // Structural check
    if (
      typeof parsed.pick !== "string" ||
      typeof parsed.effectivePrice !== "number" ||
      !Array.isArray(parsed.reasons) ||
      !Array.isArray(parsed.tradeoffs) ||
      !Array.isArray(parsed.caveats)
    ) {
      return null;
    }

    return parsed as GemmaOutput;
  } catch {
    return null;
  }
}

/**
 * Validate Gemma's output against the input context.
 * Checks:
 *  1. The picked platform exists in the offers list
 *  2. The effectivePrice matches (within ₹1 rounding tolerance)
 *  3. No price mentioned in reasons/tradeoffs is fabricated
 */
export function validateOutput(
  output: GemmaOutput,
  ctx: PromptContext
): GuardrailResult {
  const violations: string[] = [];

  // 1. Platform must exist in input
  const validPlatforms = ctx.offers.map((o) => o.platform.toLowerCase());
  if (!validPlatforms.includes(output.pick.toLowerCase())) {
    violations.push(
      `Picked platform "${output.pick}" not in input offers [${ctx.offers.map((o) => o.platform).join(", ")}]`
    );
  }

  // 2. effectivePrice must match the picked offer (within ₹1)
  const pickedOffer = ctx.offers.find(
    (o) => o.platform.toLowerCase() === output.pick.toLowerCase()
  );
  if (pickedOffer) {
    const diff = Math.abs(pickedOffer.effectivePrice - output.effectivePrice);
    if (diff > 1) {
      violations.push(
        `effectivePrice ${output.effectivePrice} doesn't match input ${pickedOffer.effectivePrice} for ${output.pick}`
      );
    }
  }

  // 3. Check for fabricated prices in text (any number > 1000 that doesn't appear in input)
  const inputPrices = new Set(
    ctx.offers.flatMap((o) => [o.price, o.effectivePrice, o.shipping, o.discount])
      .map((n) => Math.round(n))
  );

  const allText = [...output.reasons, ...output.tradeoffs, ...output.caveats].join(" ");
  const pricesInText = allText.match(/₹?\d{4,6}/g) ?? [];

  for (const match of pricesInText) {
    const num = parseInt(match.replace(/₹/, ""), 10);
    if (!inputPrices.has(num) && !inputPrices.has(num - 1) && !inputPrices.has(num + 1)) {
      violations.push(`Price ₹${num} in output text is not in input data`);
    }
  }

  if (violations.length > 0) {
    logger.warn("Gemma guardrail violations", { violations, pick: output.pick });
  }

  return {
    valid: violations.length === 0,
    violations,
    output: violations.length === 0 ? output : undefined,
  };
}
