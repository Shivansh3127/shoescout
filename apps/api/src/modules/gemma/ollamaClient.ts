/**
 * Ollama chat client — wraps the /api/chat endpoint.
 * Model is read from env so swapping is a one-liner.
 */

import axios from "axios";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface GemmaCallResult {
  text: string;
  model: string;
  durationMs: number;
  tokenCount?: number;
}

/**
 * Call Gemma (or any Ollama model) with a list of messages.
 * Returns the raw text response and basic telemetry for observability.
 */
export async function callGemma(
  messages: OllamaChatMessage[],
  timeoutMs = 60_000
): Promise<GemmaCallResult> {
  const start = Date.now();

  const response = await axios.post<OllamaChatResponse>(
    `${env.OLLAMA_BASE_URL}/api/chat`,
    {
      model: env.OLLAMA_MODEL,
      messages,
      stream: false,
      options: {
        temperature: 0.2,     // low temp → more consistent structured output
        num_predict: 800,     // cap tokens — recommendation is short
      },
    },
    { timeout: timeoutMs }
  );

  const durationMs = Date.now() - start;

  logger.info("Gemma call complete", {
    model: response.data.model,
    durationMs,
    tokens: response.data.eval_count,
  });

  return {
    text: response.data.message.content,
    model: response.data.model,
    durationMs,
    tokenCount: response.data.eval_count,
  };
}
