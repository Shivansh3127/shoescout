/**
 * Normalizer — maps raw SerpApi shopping results to our internal offer schema.
 *
 * Rules:
 *  - effective_price = price + shipping - discount
 *  - Discount is inferred from old_price when available
 *  - Size availability: use provided size from the search; mark "unknown" if
 *    SerpApi doesn't confirm it (we never guess)
 *  - Offers with unparseable prices are skipped and logged
 */

import { logger } from "../../config/logger.js";
import type { SerpApiShoppingResult } from "../serp/serpTypes.js";
import { parseShipping, tryParsePrice } from "./priceParser.js";

// ── Output schema ─────────────────────────────────────────────────────────────

export interface NormalizedOffer {
  title: string;
  platform: string;
  url: string;
  price: number;
  shipping: number;
  discount: number;
  effectivePrice: number;
  inStock: boolean;
  /** UK shoe size from the search query — NOT confirmed by the listing */
  sizeRequested: number | "unknown";
  /** True when we confirmed the size from the listing text */
  sizeConfirmed: boolean;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
  /** Raw SerpApi position for debugging */
  rawPosition: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const OUT_OF_STOCK_SIGNALS = ["out of stock", "unavailable", "sold out", "not available"];

/**
 * Verified Indian retail platforms — only these pass through.
 * Keyed on substrings that appear in SerpApi's `source` field.
 */
const TRUSTED_PLATFORMS: readonly string[] = [
  "amazon",
  "myntra",
  "flipkart",
  "nike",
  "adidas",
  "asics",
  "puma",
  "new balance",
  "newbalance",
  "tata cliq",
  "tatacliq",
  "skechers",
  "hoka",
  "brooks",
  "saucony",
  "crocs",
  "reebok",
  "under armour",
  "decathlon",
];

function isTrustedPlatform(source: string): boolean {
  const lower = source.toLowerCase();
  return TRUSTED_PLATFORMS.some((p) => lower.includes(p));
}

function isOutOfStock(result: SerpApiShoppingResult): boolean {
  const combined = [result.delivery ?? "", result.title].join(" ").toLowerCase();
  return OUT_OF_STOCK_SIGNALS.some((s) => combined.includes(s));
}

/**
 * Attempt to detect whether the listing's title/delivery text mentions the
 * requested size. We don't confirm sizes from unstructured text — we only
 * mark confirmed=true when the size appears literally.
 */
function detectSize(
  result: SerpApiShoppingResult,
  requestedSize: number | undefined
): { sizeRequested: number | "unknown"; sizeConfirmed: boolean } {
  if (!requestedSize) return { sizeRequested: "unknown", sizeConfirmed: false };

  const text = result.title.toLowerCase();
  // Look for patterns like "uk 9", "uk size 9", "size 9 uk", "uk9"
  const patterns = [
    new RegExp(`uk\\s*${requestedSize}(?:[^0-9]|$)`, "i"),
    new RegExp(`size\\s*${requestedSize}(?:[^0-9]|$)`, "i"),
    new RegExp(`(?:^|\\s)${requestedSize}\\s*uk`, "i"),
  ];

  const confirmed = patterns.some((p) => p.test(text));
  return { sizeRequested: requestedSize, sizeConfirmed: confirmed };
}

// ── Main normalizer ───────────────────────────────────────────────────────────

export interface NormalizeOptions {
  /** The UK size from the search query (used to fill sizeRequested) */
  requestedSize?: number;
}

export function normalizeResults(
  raw: SerpApiShoppingResult[],
  opts: NormalizeOptions = {}
): NormalizedOffer[] {
  const normalized: NormalizedOffer[] = [];
  let skipped = 0;

  for (const result of raw) {
    // Prefer SerpApi's pre-parsed float; fall back to parsing the string
    const price = tryParsePrice(result.extracted_price ?? result.price);

    if (price === undefined) {
      logger.warn("Normalizer: skipping result — unparseable price", {
        title: result.title,
        rawPrice: result.price,
        source: result.source,
      });
      skipped++;
      continue;
    }

    // ── Trusted platform filter ────────────────────────────────────────────
    if (!isTrustedPlatform(result.source)) {
      logger.debug("Normalizer: skipping untrusted platform", { source: result.source });
      skipped++;
      continue;
    }

    const shipping = parseShipping(result.delivery);

    // Discount = old_price - current price (when available and sensible)
    let discount = 0;
    const oldPrice = tryParsePrice(result.extracted_old_price ?? result.old_price);
    if (oldPrice !== undefined && oldPrice > price) {
      discount = Math.round((oldPrice - price) * 100) / 100;
    }

    const effectivePrice = Math.max(0, price + shipping - discount);
    const { sizeRequested, sizeConfirmed } = detectSize(result, opts.requestedSize);

    normalized.push({
      title: result.title.trim(),
      platform: result.source.trim(),
      url: result.link,
      price,
      shipping,
      discount,
      effectivePrice,
      inStock: !isOutOfStock(result),
      sizeRequested,
      sizeConfirmed,
      thumbnail: result.thumbnail,
      rating: result.rating,
      reviews: result.reviews,
      rawPosition: result.position,
    });
  }

  if (skipped > 0) {
    logger.warn("Normalizer: skipped results with bad prices", { skipped, total: raw.length });
  }

  // Sort by effective price ascending
  return normalized.sort((a, b) => a.effectivePrice - b.effectivePrice);
}
