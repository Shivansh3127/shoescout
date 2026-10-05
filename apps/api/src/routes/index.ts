import { Router } from "express";
import { healthRouter } from "./health.js";

export const router = Router();

// GET /health
router.use("/health", healthRouter);

// Phase 1+ routes will be mounted here:
// router.use("/search",   searchRouter);
// router.use("/products", productsRouter);
