import { query, queryOne } from "../../db/client.js";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PricePoint {
  time: string;      // ISO timestamp
  platform: string;
  price: number;
  is_seeded: boolean;
}

export interface PriceHistoryStats {
  platform: string;
  current_price: number | null;
  avg_30d: number | null;
  min_30d: number | null;
  max_30d: number | null;
  pct_vs_avg: number | null;   // (current - avg) / avg * 100
  data_points: number;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Fetch raw time-series points for a product (newest first, max 200 rows). */
export async function getPriceHistory(
  productId: number,
  days = 30
): Promise<PricePoint[]> {
  return query<PricePoint>(
    `SELECT time, platform, price, is_seeded
       FROM price_history
      WHERE product_id = $1
        AND time >= NOW() - ($2 || ' days')::INTERVAL
      ORDER BY time DESC
      LIMIT 200`,
    [productId, days]
  );
}

/** Aggregated 30-day stats per platform for a product. */
export async function getPriceStats(productId: number): Promise<PriceHistoryStats[]> {
  return query<PriceHistoryStats>(
    `SELECT
        platform,
        ROUND(AVG(price)::numeric, 2)                 AS avg_30d,
        ROUND(MIN(price)::numeric, 2)                 AS min_30d,
        ROUND(MAX(price)::numeric, 2)                 AS max_30d,
        COUNT(*)::int                                 AS data_points,
        -- most recent price for this platform
        (SELECT price FROM price_history ph2
          WHERE ph2.product_id = $1
            AND ph2.platform   = ph.platform
          ORDER BY time DESC LIMIT 1)                 AS current_price,
        NULL::numeric                                 AS pct_vs_avg
       FROM price_history ph
      WHERE product_id = $1
        AND time >= NOW() - INTERVAL '30 days'
      GROUP BY platform
      ORDER BY platform`,
    [productId]
  );
}

/** Insert a single price observation. Idempotent-ish (TimescaleDB handles dupes). */
export async function recordPrice(
  productId: number,
  platform: string,
  price: number,
  isSeeded = false
): Promise<void> {
  await query(
    `INSERT INTO price_history (time, product_id, platform, price, is_seeded)
          VALUES (NOW(), $1, $2, $3, $4)`,
    [productId, platform, price, isSeeded]
  );
}

/** Bulk-insert many price points in one statement (used after a search). */
export async function bulkRecordPrices(
  records: Array<{ productId: number; platform: string; price: number }>
): Promise<void> {
  if (records.length === 0) return;

  const values = records
    .map((_, i) => `(NOW(), $${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, false)`)
    .join(", ");

  const params = records.flatMap((r) => [r.productId, r.platform, r.price]);

  await query(
    `INSERT INTO price_history (time, product_id, platform, price, is_seeded)
          VALUES ${values}`,
    params
  );
}
