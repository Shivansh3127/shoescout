/**
 * Vitest global setup — runs before any test file is loaded.
 * Sets the minimum required env vars so env.ts doesn't call process.exit(1).
 * Unit tests must NOT need a real DB or API keys.
 */
process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test";
process.env["SERPAPI_KEY"]  = "test_key";
process.env["NODE_ENV"]     = "test";
