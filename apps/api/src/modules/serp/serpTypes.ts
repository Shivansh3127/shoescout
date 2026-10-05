/**
 * SerpApi Google Shopping response types.
 * Only the fields we actually use are typed; the rest are unknown.
 */

export interface SerpApiShoppingResult {
  position: number;
  title: string;
  link: string;
  source: string;           // e.g. "Amazon", "Myntra", "Flipkart"
  price?: string;           // e.g. "₹9,499"
  extracted_price?: number; // SerpApi pre-parsed float
  old_price?: string;
  extracted_old_price?: number;
  delivery?: string;        // e.g. "FREE delivery", "₹99 delivery"
  rating?: number;
  reviews?: number;
  thumbnail?: string;
}

export interface SerpApiResponse {
  search_metadata: {
    id: string;
    status: string;
    created_at: string;
  };
  search_parameters: Record<string, string>;
  shopping_results?: SerpApiShoppingResult[];
  error?: string;
}
