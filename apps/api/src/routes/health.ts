import { Router } from "express";
import { pool } from "../db/client.js";
import { getCacheStats } from "../modules/serp/serpClient.js";
import { ollamaHealthy } from "../modules/matcher/embedder.js";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const [dbOk, ollamaOk] = await Promise.all([
    pool.query("SELECT 1").then(() => true).catch(() => false),
    ollamaHealthy(),
  ]);

  const status = dbOk ? "ok" : "degraded";

  res.status(dbOk ? 200 : 503).json({
    status,
    service: "shoescout-api",
    ts: new Date().toISOString(),
    checks: {
      postgres: dbOk ? "ok" : "unreachable",
      ollama: ollamaOk ? "ok" : "unreachable",
    },
    config: {
      ollamaModel: env.OLLAMA_MODEL,
      embedModel: env.OLLAMA_EMBED_MODEL,
      fixtureMode: env.SERPAPI_FIXTURE_MODE,
    },
    serpCache: getCacheStats(),
  });
});
