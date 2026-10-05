import { Router } from "express";
import { healthRouter } from "./health.js";
import { searchRouter } from "./search.js";
import { productsRouter } from "./products.js";

export const router = Router();

router.use("/health",   healthRouter);
router.use("/search",   searchRouter);
router.use("/products", productsRouter);
