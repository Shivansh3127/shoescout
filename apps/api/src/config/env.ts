import * as z from "zod/v4";
import { config } from "dotenv";

config(); // load .env in development

const EnvSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // SerpApi
  SERPAPI_KEY: z.string().min(1, "SERPAPI_KEY is required"),
  SERPAPI_CACHE_TTL_SECONDS: z.coerce.number().default(600),
  SERPAPI_FIXTURE_MODE: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // Ollama / Gemma
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("gemma3:4b"),
  OLLAMA_EMBED_MODEL: z.string().default("nomic-embed-text"),

  // TabPFN micro-service
  TABPFN_SERVICE_URL: z.url().default("http://localhost:8001"),

  // Rate limiting
  RATE_LIMIT_RPM: z.coerce.number().default(30),

  // Friend profile defaults
  FRIEND_NAME: z.string().default("Sanskar"),
  FRIEND_DEFAULT_BUDGET: z.coerce.number().default(10000),
  FRIEND_DEFAULT_SIZE: z.coerce.number().default(9),
  FRIEND_USAGE_NOTES: z
    .string()
    .default(
      "Runs 5 km three times a week on roads. Prefers neutral cushioning."
    ),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌  Invalid environment variables:\n", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof parsed.data;
