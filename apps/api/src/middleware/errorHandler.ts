import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  const status = err.statusCode ?? 500;
  const message = status < 500 ? err.message : "Internal server error";

  if (status >= 500) {
    logger.error("Unhandled error", { err: err.message, stack: err.stack });
  }

  res.status(status).json({ error: message, code: err.code });
}
