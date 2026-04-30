import pg from 'pg'
import { config } from '../config.ts'

const { Pool } = pg

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message)
})

// Graceful shutdown that prevents dangling connections
process.on('SIGTERM', async () => {
  await pool.end()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await pool.end()
  process.exit(0)
})

const TRANSIENT_PG_CODES = new Set([
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '40001', // serialization_failure -- retry is the intended recovery
  '40P01', // deadlock_detected
  '53300', // too_many_connections -- transient under load
])

const TRANSIENT_NODE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
])

function isTransientError(err: unknown): boolean {
  const pgErr = err as pg.DatabaseError
  if (pgErr.code && TRANSIENT_PG_CODES.has(pgErr.code)) return true

  const nodeErr = err as NodeJS.ErrnoException
  if (nodeErr.code && TRANSIENT_NODE_CODES.has(nodeErr.code)) return true

  return false
}

/**
 * Connect to PostgreSQL with retry logic.
 * Retries up to `maxRetries` times with exponential backoff.
 */
export async function connectPostgres(maxRetries = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect()
      await client.query('SELECT 1')
      client.release()
      console.log('PostgreSQL connected')
      return
    } catch (err) {
      if (attempt === maxRetries) {
        throw new Error(`PostgreSQL connection failed after ${maxRetries} attempts: ${(err as Error).message}`)
      }
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000)
      console.warn(
        `⏳ PostgreSQL connection attempt ${attempt}/${maxRetries} failed – retrying in ${delay}ms…`,
        (err as Error).message,
      )
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

/**
 * Helper to run a query with automatic retry on transient errors.
 * Wraps pool.query so callers don't need to handle connection blips.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
  retries = 2,
): Promise<pg.QueryResult<T>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pool.query<T>(text, params)
    } catch (err) {
      if (isTransientError(err) && attempt < retries) {
        const delay = 500 * 2 ** attempt
        const code = (err as pg.DatabaseError).code ?? (err as NodeJS.ErrnoException).code
        console.warn(`Transient PG error (${code}) – retry ${attempt + 1}/${retries} in ${delay}ms`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('query: unexpected control flow')
}