import { z } from 'zod/v4'

/**
 * Runtime-validated environment configuration.
 * Fails fast on startup if any required variable is missing or malformed.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5555),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  MONGODB_URL: z.string().url().regex(/^mongodb(?:\+srv)?:\/\//, 'Must start with mongodb:// or mongodb+srv://'),
  REDIS_URL: z.string().url().startsWith('redis://'),

  /** General */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Ingestion tuning */
  RING_BUFFER_CAPACITY: z.coerce.number().int().positive().default(50_000),
  DEBOUNCE_WINDOW_MS: z.coerce.number().int().positive().default(10_000),
  DEBOUNCE_THRESHOLD: z.coerce.number().int().positive().default(100),

  /** Worker tuning */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),

  /** Rate limiter */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1_000),
})

export type Env = z.infer<typeof envSchema>

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌ Invalid environment configuration:')
    console.error(z.prettifyError(result.error))
    process.exit(1)
  }

  return result.data
}

/** Singleton config — import this everywhere. */
export const config = loadConfig()
