/**
 * Search service — orchestrates the full pipeline:
 *   SerpApi → normalizer → product matcher → price-history store → response
 */

import { logger } from "../../config/logger.js";
import { bulkRecordPrices } from "../../db/queries/priceHistory.js";
import { normalizeResults, type NormalizedOffer } from "../normalizer/normalizer.js";
import { searchShoes } from "../serp/serpClient.js";
import { matchProduct } from "../matcher/matcher.js";
import type { SearchRequest } from "./searchSchemas.js";

// ── Output types ──────────────────────────────────────────────────────────────

export interface SearchResultOffer extends NormalizedOffer {
  productId: number;
  matchType: "rule" | "vector" | "new";
  matchConfidence?: number;
  lowConfidenceMatch?: boolean;
}

export interface SearchResponse {
  query: string;
  size?: number;
  budget?: number;
  totalFound: number;
  withinBudget: number;
  offers: SearchResultOffer[];
  /** True if any result came from the SerpApi fixture (dev mode) */
  fromFixture: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

export async function runSearch(req: SearchRequest): Promise<SearchResponse> {
  const startMs = Date.now();

  // 1. Fetch from SerpApi (cache-backed or fixture)
  const rawResults = await searchShoes({ query: req.query, size: req.size });

  // 2. Normalize: effective_price = price + shipping - discount
  const normalized = normalizeResults(rawResults, { requestedSize: req.size });

  // 3. Match each offer to a canonical product (rule → vector → new)
  const enriched: SearchResultOffer[] = [];
  const priceRecords: Array<{ productId: number; platform: string; price: number }> = [];

  await Promise.all(
    normalized.map(async (offer) => {
      try {
        const match = await matchProduct(offer.title);
        enriched.push({
          ...offer,
          productId: match.product.id,
          matchType: match.matchType,
          matchConfidence: match.confidence,
          lowConfidenceMatch: match.lowConfidence,
        });
        priceRecords.push({
          productId: match.product.id,
          platform: offer.platform,
          price: offer.price,
        });
      } catch (err) {
        // Don't fail the whole search if one product match errors
        logger.error("Product match failed — skipping offer", {
          title: offer.title,
          err: (err as Error).message,
        });
      }
    })
  );

  // 4. Persist prices to history (fire-and-forget with logging — never block response)
  bulkRecordPrices(priceRecords).catch((err) =>
    logger.error("Failed to persist price history", { err: (err as Error).message })
  );

  // 5. Apply budget filter and re-sort by effectivePrice
  const budgetFiltered = req.budget
    ? enriched.filter((o) => o.effectivePrice <= req.budget!)
    : enriched;

  budgetFiltered.sort((a, b) => a.effectivePrice - b.effectivePrice);

  logger.info("Search complete", {
    query: req.query,
    size: req.size,
    budget: req.budget,
    rawCount: rawResults.length,
    normalizedCount: normalized.length,
    matchedCount: enriched.length,
    budgetFilteredCount: budgetFiltered.length,
    durationMs: Date.now() - startMs,
  });

  return {
    query: req.query,
    size: req.size,
    budget: req.budget,
    totalFound: enriched.length,
    withinBudget: budgetFiltered.length,
    offers: budgetFiltered,
    fromFixture: process.env["SERPAPI_FIXTURE_MODE"] === "true",
  };
}
