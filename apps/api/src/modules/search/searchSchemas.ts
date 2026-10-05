import * as z from "zod/v4";

// ── POST /search ──────────────────────────────────────────────────────────────
export const SearchRequestSchema = z.object({
  query: z
    .string()
    .min(2, "Query must be at least 2 characters")
    .max(200, "Query too long"),
  size: z
    .number({ error: "size must be a number (UK shoe size, e.g. 9)" })
    .min(1)
    .max(20)
    .optional(),
  budget: z
    .number({ error: "budget must be a number in INR" })
    .positive("Budget must be positive")
    .optional(),
  notes: z
    .string()
    .max(500, "Notes too long")
    .optional(),
  gender: z
    .enum(["men", "women", "unisex"])
    .optional()
    .default("men"),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

// ── GET /products/:id/history ─────────────────────────────────────────────────
export const HistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
