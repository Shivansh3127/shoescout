import { Router, type Request, type Response, type NextFunction } from "express";
import { SearchRequestSchema } from "../modules/search/searchSchemas.js";
import { runSearch } from "../modules/search/searchService.js";

export const searchRouter = Router();

/**
 * POST /search
 * Body: { query, size?, budget?, notes? }
 * Returns: normalized offers sorted by effectivePrice, with product metadata
 */
searchRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = SearchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation error",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await runSearch(parsed.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);
