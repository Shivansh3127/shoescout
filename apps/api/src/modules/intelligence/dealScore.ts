/**
 * Deal score — rates how good a price is right now (0–10).
 *
 * Scoring breakdown (all components are additive):
 *   vs_avg   (0-4): how far below the 30-day average
 *   vs_min   (0-3): how close to the 30-day minimum
 *   discount (0-2): explicit discount % from old_price
 *   stock    (0-1): in stock = 1, unknown/out = 0
 *
 * Returns the numeric score plus a human-readable breakdown
 * so the Gemma prompt has structured context.
 */

import type { PriceHistoryStats } from "../../db/queries/priceHistory.js";
import type { NormalizedOffer } from "../normalizer/normalizer.js";

// ── Output types ──────────────────────────────────────────────────────────────

export interface DealScoreComponent {
  label: string;
  points: number;
  max: number;
  reason: string;
}

export interface DealScore {
  score: number;          // 0–10
  label: "Excellent" | "Good" | "Fair" | "Wait";
  components: DealScoreComponent[];
  summary: string;        // one-line human-readable
}

// ── Scoring logic ─────────────────────────────────────────────────────────────

function vsAvgScore(
  current: number,
  avg30d: number | null
): DealScoreComponent {
  if (avg30d === null || avg30d === 0) {
    return { label: "vs 30-day avg", points: 0, max: 4, reason: "No historical data" };
  }
  const pct = (avg30d - current) / avg30d;   // positive = cheaper than avg
  let points = 0;
  let reason = "";

  if (pct >= 0.15) { points = 4; reason = `${(pct * 100).toFixed(1)}% below 30-day avg — great timing`; }
  else if (pct >= 0.08) { points = 3; reason = `${(pct * 100).toFixed(1)}% below 30-day avg`; }
  else if (pct >= 0.03) { points = 2; reason = `Slightly below 30-day avg`; }
  else if (pct >= -0.03) { points = 1; reason = "Near the 30-day average"; }
  else { points = 0; reason = `${(Math.abs(pct) * 100).toFixed(1)}% above 30-day avg — not the best time`; }

  return { label: "vs 30-day avg", points, max: 4, reason };
}

function vsMinScore(
  current: number,
  min30d: number | null
): DealScoreComponent {
  if (min30d === null || min30d === 0) {
    return { label: "vs 30-day min", points: 0, max: 3, reason: "No historical data" };
  }
  const diffPct = (current - min30d) / min30d;  // 0 = AT the min
  let points = 0;
  let reason = "";

  if (diffPct <= 0.01) { points = 3; reason = "At or near the 30-day lowest price"; }
  else if (diffPct <= 0.05) { points = 2; reason = `Only ${(diffPct * 100).toFixed(1)}% above 30-day low`; }
  else if (diffPct <= 0.12) { points = 1; reason = `${(diffPct * 100).toFixed(1)}% above 30-day low`; }
  else { points = 0; reason = `${(diffPct * 100).toFixed(1)}% above 30-day low`; }

  return { label: "vs 30-day min", points, max: 3, reason };
}

function discountScore(offer: NormalizedOffer): DealScoreComponent {
  if (offer.discount <= 0) {
    return { label: "discount", points: 0, max: 2, reason: "No explicit discount" };
  }
  const base = offer.price + offer.discount;  // reconstruct original price
  const pct = offer.discount / base;
  let points = 0;
  let reason = "";

  if (pct >= 0.25) { points = 2; reason = `${(pct * 100).toFixed(0)}% off — strong discount`; }
  else if (pct >= 0.10) { points = 1; reason = `${(pct * 100).toFixed(0)}% off`; }
  else { points = 0; reason = `<10% off — marginal discount`; }

  return { label: "discount", points, max: 2, reason };
}

function stockScore(offer: NormalizedOffer): DealScoreComponent {
  return {
    label: "availability",
    points: offer.inStock ? 1 : 0,
    max: 1,
    reason: offer.inStock ? "In stock" : "Out of stock or unknown",
  };
}

function scoreToLabel(score: number): DealScore["label"] {
  if (score >= 8) return "Excellent";
  if (score >= 5) return "Good";
  if (score >= 3) return "Fair";
  return "Wait";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a single offer against its platform's 30-day price history.
 * Pass `stats` for the matching platform; if not found, historical
 * components score 0 (clearly stated in reasons).
 */
export function scoreDeal(
  offer: NormalizedOffer,
  stats: PriceHistoryStats | undefined
): DealScore {
  const avg30d = stats?.avg_30d ?? null;
  const min30d = stats?.min_30d ?? null;

  const components: DealScoreComponent[] = [
    vsAvgScore(offer.price, avg30d),
    vsMinScore(offer.price, min30d),
    discountScore(offer),
    stockScore(offer),
  ];

  const score = Math.min(10, components.reduce((sum, c) => sum + c.points, 0));
  const label = scoreToLabel(score);

  const summaryParts: string[] = [];
  if (avg30d) summaryParts.push(`30d avg ₹${avg30d.toLocaleString("en-IN")}`);
  if (min30d) summaryParts.push(`30d low ₹${min30d.toLocaleString("en-IN")}`);
  if (offer.discount > 0) summaryParts.push(`₹${offer.discount.toLocaleString("en-IN")} off`);

  const summary =
    summaryParts.length > 0
      ? `${label} deal (${score}/10) — ${summaryParts.join(", ")}`
      : `${label} deal (${score}/10) — no price history available`;

  return { score, label, components, summary };
}
