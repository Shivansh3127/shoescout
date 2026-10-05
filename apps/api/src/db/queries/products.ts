import { query, queryOne } from "../../db/client.js";
import type { ProductRow } from "../matcher/matcher.js";

export async function getProductById(id: number): Promise<ProductRow | undefined> {
  return queryOne<ProductRow>(
    `SELECT id, brand, model, canonical_name, gender, category
       FROM products
      WHERE id = $1`,
    [id]
  );
}

export async function listProducts(limit = 50): Promise<ProductRow[]> {
  return query<ProductRow>(
    `SELECT id, brand, model, canonical_name, gender, category
       FROM products
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
}
