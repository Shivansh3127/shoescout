/**
 * Search service — orchestrates the full pipeline:
 *   SerpApi → normalizer → product matcher → price-history store
 *   → deal score → Gemma recommendation → response
 */

import { logger } from "../../config/logger.js";
import { bulkRecordPrices, getPriceStats } from "../../db/queries/priceHistory.js";
import { normalizeResults, type NormalizedOffer } from "../normalizer/normalizer.js";
import { searchShoes } from "../serp/serpClient.js";
import { matchProduct } from "../matcher/matcher.js";
import { scoreDeal, type DealScore } from "../intelligence/dealScore.js";
import { getRecommendation, type RecommendationResult } from "../gemma/gemmaService.js";
import { env } from "../../config/env.js";
import type { SearchRequest } from "./searchSchemas.js";
import type { PriceHistoryStats } from "../../db/queries/priceHistory.js";

// ── Output types ──────────────────────────────────────────────────────────────

export interface SearchResultOffer extends NormalizedOffer {
  productId: number;
  matchType: "rule" | "vector" | "new";
  matchConfidence?: number;
  lowConfidenceMatch?: boolean;
  dealScore: DealScore;
}

export interface SearchResponse {
  query: string;
  size?: number;
  budget?: number;
  totalFound: number;
  withinBudget: number;
  offers: SearchResultOffer[];
  recommendation: RecommendationResult | null;
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

  // Collect all product IDs so we can fetch their price stats in one batch
  const matchResults = await Promise.all(
    normalized.map(async (offer) => {
      try {
        const match = await matchProduct(offer.title);
        priceRecords.push({
          productId: match.product.id,
          platform: offer.platform,
          price: offer.price,
        });
        return { offer, match };
      } catch (err) {
        logger.error("Product match failed — skipping offer", {
          title: offer.title,
          err: (err as Error).message,
        });
        return null;
      }
    })
  );

  // 4. Fetch price stats for all matched products (one query per unique product)
  const productIds = [...new Set(
    matchResults.filter(Boolean).map((r) => r!.match.product.id)
  )];

  const statsMap = new Map<string, PriceHistoryStats>();
  await Promise.all(
    productIds.map(async (pid) => {
      const { getPriceStats } = await import("../../db/queries/priceHistory.js");
      const stats = await getPriceStats(pid);
      for (const s of stats) {
        statsMap.set(`${pid}:${s.platform}`, s);
      }
    })
  );

  // 5. Score each offer
  for (const result of matchResults) {
    if (!result) continue;
    const { offer, match } = result;
    const statsKey = `${match.product.id}:${offer.platform}`;
    const stats = statsMap.get(statsKey);
    const dealScore = scoreDeal(offer, stats);

    enriched.push({
      ...offer,
      productId: match.product.id,
      matchType: match.matchType,
      matchConfidence: match.confidence,
      lowConfidenceMatch: match.lowConfidence,
      dealScore,
    });
  }

  // 6. Persist prices (fire-and-forget)
  bulkRecordPrices(priceRecords).catch((err) =>
    logger.error("Failed to persist price history", { err: (err as Error).message })
  );

  // 7. Budget filter + sort
  const budgetFiltered = req.budget
    ? enriched.filter((o) => o.effectivePrice <= req.budget!)
    : enriched;

  budgetFiltered.sort((a, b) => a.effectivePrice - b.effectivePrice);

  // 8. Gemma recommendation (skip if no offers)
  let recommendation: RecommendationResult | null = null;
  if (budgetFiltered.length > 0) {
    try {
      recommendation = await getRecommendation({
        friend: {
          name: env.FRIEND_NAME,
          budget: req.budget ?? env.FRIEND_DEFAULT_BUDGET,
          size: req.size ?? env.FRIEND_DEFAULT_SIZE,
          usageNotes: req.notes ?? env.FRIEND_USAGE_NOTES,
        },
        offers: budgetFiltered.slice(0, 5),
        query: req.query,
      });
    } catch (err) {
      logger.error("Gemma recommendation failed entirely", {
        err: (err as Error).message,
      });
    }
  }

  logger.info("Search complete", {
    query: req.query,
    rawCount: rawResults.length,
    matchedCount: enriched.length,
    budgetFilteredCount: budgetFiltered.length,
    hasRecommendation: !!recommendation,
    recommendationSource: recommendation?.source,
    durationMs: Date.now() - startMs,
  });

  return {
    query: req.query,
    size: req.size,
    budget: req.budget,
    totalFound: enriched.length,
    withinBudget: budgetFiltered.length,
    offers: budgetFiltered,
    recommendation,
    fromFixture: env.SERPAPI_FIXTURE_MODE,
  };
}
