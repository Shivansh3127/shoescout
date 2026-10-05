/**
 * SerpApi Google Shopping client.
 *
 * Features:
 *  - 10-minute in-memory response cache (keyed by query string)
 *  - 3 retries with exponential back-off on transient failures
 *  - Configurable timeout
 *  - Fixture mode: when SERPAPI_FIXTURE_MODE=true reads from
 *    tests/fixtures/google_shopping_<slug>.json — no API quota burned
 */

import axios, { type AxiosError } from "axios";
import NodeCache from "node-cache";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { SerpApiResponse, SerpApiShoppingResult } from "./serpTypes.js";

// ── Cache ─────────────────────────────────────────────────────────────────────
const cache = new NodeCache({ stdTTL: env.SERPAPI_CACHE_TTL_SECONDS, checkperiod: 60 });

// ── Fixture helpers ───────────────────────────────────────────────────────────
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "../../../tests/fixtures");

function queryToSlug(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60);
}

async function loadFixture(q: string): Promise<SerpApiResponse> {
  const slug = queryToSlug(q);
  const filePath = path.join(FIXTURE_DIR, `google_shopping_${slug}.json`);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    logger.debug("SerpApi fixture loaded", { file: filePath });
    return JSON.parse(raw) as SerpApiResponse;
  } catch {
    // Fall back to the generic sample fixture so dev always has data
    const fallback = path.join(FIXTURE_DIR, "google_shopping_sample.json");
    logger.warn("SerpApi fixture not found — using sample fixture", { slug, filePath });
    const raw = await fs.readFile(fallback, "utf-8");
    return JSON.parse(raw) as SerpApiResponse;
  }
}

// ── Retry logic ───────────────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(params: Record<string, string>): Promise<SerpApiResponse> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get<SerpApiResponse>("https://serpapi.com/search", {
        params: {
          engine: "google_shopping",
          api_key: env.SERPAPI_KEY,
          gl: "in",          // India
          hl: "en",
          currency: "INR",
          ...params,
        },
        timeout: 10_000,
      });

      if (response.data.error) {
        throw new Error(`SerpApi error: ${response.data.error}`);
      }

      return response.data;
    } catch (err) {
      lastErr = err;
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status ?? 0;

      // Don't retry on auth/bad-request errors
      if (status === 401 || status === 400) throw err;

      const delay = BASE_DELAY_MS * 2 ** attempt;
      logger.warn("SerpApi request failed — retrying", { attempt, delay, status });
      await sleep(delay);
    }
  }

  throw lastErr;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SearchOptions {
  query: string;
  /** If provided, appended to query for more targeted results */
  size?: number;
}

export async function searchShoes(opts: SearchOptions): Promise<SerpApiShoppingResult[]> {
  const q = opts.size ? `${opts.query} UK size ${opts.size}` : opts.query;
  const cacheKey = `serp:${q}`;

  // 1. Cache hit
  const cached = cache.get<SerpApiShoppingResult[]>(cacheKey);
  if (cached) {
    logger.debug("SerpApi cache hit", { q });
    return cached;
  }

  // 2. Fixture mode
  let data: SerpApiResponse;
  if (env.SERPAPI_FIXTURE_MODE) {
    data = await loadFixture(q);
  } else {
    // 3. Live API call
    logger.info("SerpApi live request", { q });
    data = await fetchWithRetry({ q });
  }

  const results = data.shopping_results ?? [];
  cache.set(cacheKey, results);

  logger.info("SerpApi results fetched", {
    q,
    count: results.length,
    source: env.SERPAPI_FIXTURE_MODE ? "fixture" : "live",
  });

  return results;
}

/** Expose cache stats for the /health endpoint */
export function getCacheStats() {
  return cache.getStats();
}
