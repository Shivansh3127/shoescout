import express from "express";
import rateLimit from "express-rate-limit";
import * as path from "node:path";
import * as url from "node:url";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { router } from "./routes/index.js";

const app = express();

// ── Static frontend ───────────────────────────────────────────────────────────
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "../../web");
app.use(express.static(webDir));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 60_000,
    max: env.RATE_LIMIT_RPM,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — slow down." },
  })
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/", router);

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
  logger.info(`ShoeScout API listening`, { port: env.PORT, env: env.NODE_ENV });
});

export { app };
