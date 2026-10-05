/**
 * Product matcher — maps a raw offer title to a canonical product in the DB.
 *
 * Strategy (two-stage):
 *  1. Rule-based: extract brand + model number (e.g. "Nike Pegasus 41") and
 *     do a fast exact/ilike lookup. Fast, zero-cost.
 *  2. Vector: embed the title with nomic-embed-text → cosine search in
 *     pgvector. Threshold: 0.82. Returns the top match.
 *
 * Low-confidence matches (similarity < WARN_THRESHOLD) are logged but still
 * returned — never silently merged with high confidence.
 *
 * If no match found, upserts a new product row from the title.
 */

import { logger } from "../../config/logger.js";
import { pool, query, queryOne } from "../../db/client.js";
import { embed, formatVector } from "./embedder.js";

// ── Thresholds ────────────────────────────────────────────────────────────────
const VECTOR_MATCH_THRESHOLD = 0.82;   // below this → new product
const VECTOR_WARN_THRESHOLD  = 0.88;   // between 0.82-0.88 → log warning

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProductRow {
  id: number;
  brand: string;
  model: string;
  canonical_name: string;
  gender: string;
  category: string;
}

interface MatchResult {
  product: ProductRow;
  matchType: "rule" | "vector" | "new";
  confidence?: number;   // 0–1, only set for vector matches
  lowConfidence?: boolean;
}

// ── Rule-based extraction ─────────────────────────────────────────────────────

const KNOWN_BRANDS = [
  "Nike", "Adidas", "Puma", "Asics", "New Balance", "Brooks", "Saucony",
  "Hoka", "On Running", "Mizuno", "Reebok", "Salomon",
];

interface ExtractedBrandModel {
  brand: string;
  modelHint: string;
}

function extractBrandModel(title: string): ExtractedBrandModel | null {
  const upperTitle = title.toUpperCase();

  for (const brand of KNOWN_BRANDS) {
    if (upperTitle.includes(brand.toUpperCase())) {
      // Remove the brand, size info, gender words, and "Shoes" to get model hint
      const modelHint = title
        .replace(new RegExp(brand, "i"), "")
        .replace(/\b(men'?s?|women'?s?|unisex|running|shoes?|uk\s*\d+(\.\d)?)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      return { brand, modelHint };
    }
  }

  return null;
}

// ── DB lookups ────────────────────────────────────────────────────────────────

async function findByRules(extracted: ExtractedBrandModel): Promise<ProductRow | undefined> {
  // Match on brand + first significant word of modelHint (e.g. "Pegasus 41")
  const modelWords = extracted.modelHint.split(/\s+/).filter((w) => w.length > 2);
  if (modelWords.length === 0) return undefined;

  return queryOne<ProductRow>(
    `SELECT id, brand, model, canonical_name, gender, category
       FROM products
      WHERE brand ILIKE $1
        AND canonical_name ILIKE $2
      LIMIT 1`,
    [extracted.brand, `%${modelWords.slice(0, 2).join("%")}%`]
  );
}

async function findByVector(embedding: number[]): Promise<{ row: ProductRow; similarity: number } | undefined> {
  const rows = await query<ProductRow & { similarity: number }>(
    `SELECT id, brand, model, canonical_name, gender, category,
            1 - (embedding <=> $1::vector) AS similarity
       FROM products
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 1`,
    [formatVector(embedding)]
  );

  if (!rows.length || rows[0].similarity < VECTOR_MATCH_THRESHOLD) return undefined;
  return { row: rows[0], similarity: rows[0].similarity };
}

async function upsertProduct(title: string, embedding: number[]): Promise<ProductRow> {
  const extracted = extractBrandModel(title);
  const brand = extracted?.brand ?? "Unknown";
  const model = extracted?.modelHint ?? title;
  const canonicalName = extracted ? `${brand} ${model}`.replace(/\s+/g, " ").trim() : title;

  const existing = await queryOne<ProductRow>(
    `SELECT id, brand, model, canonical_name, gender, category
       FROM products WHERE canonical_name = $1`,
    [canonicalName]
  );
  if (existing) return existing;

  const [inserted] = await query<ProductRow>(
    `INSERT INTO products (brand, model, canonical_name, embedding)
          VALUES ($1, $2, $3, $4::vector)
     ON CONFLICT (canonical_name) DO UPDATE SET embedding = EXCLUDED.embedding
     RETURNING id, brand, model, canonical_name, gender, category`,
    [brand, model, canonicalName, formatVector(embedding)]
  );

  return inserted;
}

async function updateEmbedding(productId: number, embedding: number[]): Promise<void> {
  await pool.query(
    `UPDATE products SET embedding = $1::vector WHERE id = $2`,
    [formatVector(embedding), productId]
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Match an offer title to a canonical product.
 * Logs low-confidence matches; never silently merges uncertain products.
 */
export async function matchProduct(title: string): Promise<MatchResult> {
  // Stage 1: rule-based
  const extracted = extractBrandModel(title);
  if (extracted) {
    const ruleMatch = await findByRules(extracted);
    if (ruleMatch) {
      logger.debug("Product matched by rules", { title, productId: ruleMatch.id });
      return { product: ruleMatch, matchType: "rule" };
    }
  }

  // Stage 2: vector
  let embedding: number[];
  try {
    embedding = await embed(title);
  } catch (err) {
    logger.error("Embedding failed — creating new product without vector", {
      title,
      err: (err as Error).message,
    });
    // Fall through to upsert without embedding
    const product = await upsertProduct(title, []);
    return { product, matchType: "new" };
  }

  const vectorMatch = await findByVector(embedding);
  if (vectorMatch) {
    const { row, similarity } = vectorMatch;
    const lowConfidence = similarity < VECTOR_WARN_THRESHOLD;

    if (lowConfidence) {
      logger.warn("Low-confidence product vector match", {
        title,
        matchedProduct: row.canonical_name,
        similarity: similarity.toFixed(4),
      });
    } else {
      logger.debug("Product matched by vector", {
        title,
        productId: row.id,
        similarity: similarity.toFixed(4),
      });
    }

    // Refresh embedding if the product doesn't have one yet
    if (!row.id) await updateEmbedding(row.id, embedding);

    return { product: row, matchType: "vector", confidence: similarity, lowConfidence };
  }

  // Stage 3: create new product
  logger.info("No product match found — creating new product", { title });
  const newProduct = await upsertProduct(title, embedding);
  return { product: newProduct, matchType: "new" };
}
