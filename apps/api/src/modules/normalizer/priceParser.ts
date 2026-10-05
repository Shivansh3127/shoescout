/**
 * Price string parser.
 *
 * Handles inputs like:
 *   "₹9,499"   "Rs. 9,499"   "INR 9499"   "9,499.00"
 *   "₹9,499.00"  " ₹ 9 499 "  "9499"
 *
 * Returns a number (INR) or throws a descriptive error.
 * Never returns NaN silently.
 */

const CURRENCY_PREFIXES = /^(₹|rs\.?|inr)\s*/i;

/**
 * Parse a price string into a plain number (INR).
 *
 * @throws {Error} if the string cannot be parsed to a valid positive number
 */
export function parsePrice(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) {
    throw new Error("Price is missing (undefined/null)");
  }

  // SerpApi sometimes gives us a pre-parsed float — use it directly
  if (typeof raw === "number") {
    if (!isFinite(raw) || isNaN(raw)) {
      throw new Error(`Invalid numeric price: ${raw}`);
    }
    if (raw < 0) {
      throw new Error(`Negative price not allowed: ${raw}`);
    }
    return raw;
  }

  const cleaned = raw
    .trim()
    .replace(CURRENCY_PREFIXES, "")  // strip ₹ / Rs. / INR
    .replace(/\s/g, "")             // remove all whitespace
    .replace(/,/g, "");             // remove thousands commas

  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    throw new Error(`Cannot parse price string: "${raw}" → "${cleaned}"`);
  }

  if (parsed < 0) {
    throw new Error(`Negative price not allowed: "${raw}"`);
  }

  return parsed;
}

/**
 * Try to parse; return undefined (and log the reason) instead of throwing.
 * Used where a missing price should skip the offer rather than crash the pipeline.
 */
export function tryParsePrice(raw: string | number | undefined | null): number | undefined {
  try {
    return parsePrice(raw);
  } catch {
    return undefined;
  }
}

/**
 * Parse a delivery/shipping string into an INR amount.
 * Returns 0 for free shipping, undefined if unparseable.
 *
 * Examples:
 *   "FREE delivery"  → 0
 *   "Free"           → 0
 *   "₹99 delivery"  → 99
 *   "Delivery: ₹49" → 49
 */
export function parseShipping(raw: string | undefined | null): number {
  if (!raw) return 0;
  const lower = raw.toLowerCase();
  if (lower.includes("free")) return 0;

  // Extract the first number from the string
  const match = raw.match(/[\d,]+(?:\.\d+)?/);
  if (!match) return 0;

  const parsed = parseFloat(match[0].replace(/,/g, ""));
  return isNaN(parsed) ? 0 : parsed;
}
