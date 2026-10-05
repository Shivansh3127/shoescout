/**
 * Ollama embedding client.
 * Uses nomic-embed-text (768-dim, open-weight) via the local Ollama server.
 */

import axios from "axios";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

interface OllamaEmbedResponse {
  embedding: number[];
}

/**
 * Get a 768-dim embedding vector for a text string.
 * Returns a float array suitable for pgvector storage.
 */
export async function embed(text: string): Promise<number[]> {
  const response = await axios.post<OllamaEmbedResponse>(
    `${env.OLLAMA_BASE_URL}/api/embeddings`,
    { model: env.OLLAMA_EMBED_MODEL, prompt: text },
    { timeout: 15_000 }
  );

  const { embedding } = response.data;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`Ollama returned empty embedding for: "${text.slice(0, 60)}"`);
  }

  return embedding;
}

/**
 * Format a float array as a pgvector literal: '[0.1,0.2,...]'
 */
export function formatVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Cosine similarity between two equal-length vectors (pure JS, for tests). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vector length mismatch");
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Quick health-check: can we reach Ollama? */
export async function ollamaHealthy(): Promise<boolean> {
  try {
    await axios.get(`${env.OLLAMA_BASE_URL}/api/tags`, { timeout: 3_000 });
    return true;
  } catch {
    logger.warn("Ollama unreachable", { url: env.OLLAMA_BASE_URL });
    return false;
  }
}
