import { Router, type Request, type Response, type NextFunction } from "express";
import { HistoryQuerySchema } from "../modules/search/searchSchemas.js";
import { getPriceHistory, getPriceStats } from "../db/queries/priceHistory.js";
import { getProductById } from "../db/queries/products.js";

export const productsRouter = Router();

/**
 * GET /products/:id/history?days=30
 * Returns price time-series + 30-day aggregated stats per platform.
 * Synthetic (seeded) rows are clearly flagged with is_seeded=true.
 */
productsRouter.get(
  "/:id/history",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = parseInt(req.params["id"] ?? "", 10);
      if (isNaN(productId) || productId <= 0) {
        res.status(400).json({ error: "Invalid product id" });
        return;
      }

      const queryParsed = HistoryQuerySchema.safeParse(req.query);
      if (!queryParsed.success) {
        res.status(400).json({
          error: "Validation error",
          details: queryParsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { days } = queryParsed.data;

      // Check product exists
      const product = await getProductById(productId);
      if (!product) {
        res.status(404).json({ error: `Product ${productId} not found` });
        return;
      }

      const [history, stats] = await Promise.all([
        getPriceHistory(productId, days),
        getPriceStats(productId),
      ]);

      // Compute pct_vs_avg on the fly now that we have current_price
      const statsWithPct = stats.map((s) => ({
        ...s,
        pct_vs_avg:
          s.current_price !== null && s.avg_30d !== null && s.avg_30d !== 0
            ? Math.round(((s.current_price - s.avg_30d) / s.avg_30d) * 10000) / 100
            : null,
      }));

      res.json({
        product,
        days,
        dataDisclosure:
          history.some((p) => p.is_seeded)
            ? "⚠️  Some or all of this data is synthetic (is_seeded=true) — for demo purposes only."
            : null,
        stats: statsWithPct,
        history,
      });
    } catch (err) {
      next(err);
    }
  }
);
