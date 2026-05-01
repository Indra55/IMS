import { Worker, UnrecoverableError } from 'bullmq'
import { config } from '../config.ts'
import { Signal } from '../models/Signal.ts'
import { pool } from '../db/postgres.ts'
import { setWorkItemCache, incrementSignalCount } from '../db/redis.ts'
import { COMPONENT_PRIORITY_MAP } from '../models/types.ts'
import { routeAlert } from '../workflow/strategy.ts'
import type { ComponentType } from '../models/Signal.ts'
import {
  QUEUE_NAME,
  JOB_PROCESS_SIGNALS,
  JOB_CREATE_WORK_ITEM,
  type ProcessSignalsPayload,
  type CreateWorkItemPayload,
  type JobPayload,
} from './producer.ts'

// ─── Dead-letter queue name ───────────────────────────────────────────────────

export const DLQ_NAME = 'ims-jobs-dlq'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the correct PostgreSQL priority for a component type,
 * falling back to P2 if the mapping is unknown.
 */
function resolvePriority(componentType: string): string {
  return COMPONENT_PRIORITY_MAP[componentType as ComponentType] ?? 'P2'
}

/**
 * Builds the incident title from component id and signal count.
 */
function buildTitle(componentId: string, signalCount: number): string {
  return `Incident: ${componentId} — ${signalCount} signal${signalCount !== 1 ? 's' : ''} detected`
}

// ─── Job handler: process-signals ────────────────────────────────────────────

/**
 * Bulk-insert raw signals into MongoDB.
 * Skips duplicates via `ordered: false` + unique index on signal_id.
 */
async function handleProcessSignals(payload: ProcessSignalsPayload): Promise<void> {
  const { signals } = payload

  if (signals.length === 0) return

  const docs = signals.map((s) => ({
    signal_id:      s.signal_id,
    component_id:   s.component_id,
    component_type: s.component_type,
    severity:       s.severity,
    message:        s.message,
    payload:        s.payload ?? {},
    work_item_id:   null,
    timestamp:      s.timestamp,
    ingested_at:    new Date(),
  }))

  try {
    const result = await Signal.insertMany(docs, { ordered: false })
    console.log(`[Worker] process-signals: inserted ${result.length}/${docs.length} signals into MongoDB`)
  } catch (err: unknown) {
    // BulkWriteError with writeErrors means some were dup-key skipped — that's fine
    const bulkErr = err as { name?: string; result?: { insertedCount?: number } }
    if (bulkErr.name === 'MongoBulkWriteError') {
      const inserted = bulkErr.result?.insertedCount ?? '?'
      console.warn(`[Worker] process-signals: bulk write partial (${inserted} inserted, rest were duplicates)`)
      return
    }
    throw err
  }

  // Increment per-component signal counters in Redis (non-blocking, best-effort)
  const componentIds = [...new Set(signals.map((s) => s.component_id))]
  await Promise.allSettled(componentIds.map((id) => incrementSignalCount(id)))
}

// ─── Job handler: create-work-item ───────────────────────────────────────────

/**
 * 1. Bulk-insert signals into MongoDB (same as process-signals, they may not
 *    have been persisted yet if debouncer flushed before the drain job ran).
 * 2. Transactionally insert the work item into PostgreSQL.
 * 3. Link all signal documents to the new work item in MongoDB.
 * 4. Cache the work item in Redis.
 *
 * If the PostgreSQL insert fails the transaction is rolled back; MongoDB
 * signals remain (unlinked) so no data is lost — they can be re-linked on retry.
 */
async function handleCreateWorkItem(payload: CreateWorkItemPayload): Promise<void> {
  const { component_id, component_type, signals } = payload

  // ── Step 1: persist raw signals in Mongo ──────────────────────────────────
  const signalDocs = signals.map((s) => ({
    signal_id:      s.signal_id,
    component_id:   s.component_id,
    component_type: s.component_type,
    severity:       s.severity,
    message:        s.message,
    payload:        s.payload ?? {},
    work_item_id:   null,
    timestamp:      s.timestamp,
    ingested_at:    new Date(),
  }))

  const signalIds: string[] = []

  try {
    await Signal.insertMany(signalDocs, { ordered: false })
  } catch (err: unknown) {
    const bulkErr = err as { name?: string }
    if (bulkErr.name !== 'MongoBulkWriteError') throw err
    // duplicates already exist — that's fine
  }

  // Collect all signal_ids for linking
  signalIds.push(...signals.map((s) => s.signal_id))

  // ── Step 2: create work item in Postgres (transactional) ──────────────────
  const priority = resolvePriority(component_type)
  const title    = buildTitle(component_id, signals.length)

  const pgClient = await pool.connect()
  let workItemId: string

  try {
    await pgClient.query('BEGIN')

    // Upsert-style: if an OPEN/INVESTIGATING work item already exists for this
    // component, increment its signal_count instead of creating a new one.
    const upsertResult = await pgClient.query<{ id: string; is_new: boolean }>(`
      WITH existing AS (
        SELECT id FROM work_items
        WHERE component_id = $1
          AND state IN ('OPEN', 'INVESTIGATING')
        ORDER BY created_at DESC
        LIMIT 1
      ),
      updated AS (
        UPDATE work_items
        SET    signal_count = signal_count + $3,
               updated_at   = NOW()
        FROM   existing
        WHERE  work_items.id = existing.id
        RETURNING work_items.id, false AS is_new
      ),
      inserted AS (
        INSERT INTO work_items (component_id, state, priority, title, signal_count)
        SELECT $1, 'OPEN', $2::priority, $4, $3
        WHERE  NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id, true AS is_new
      )
      SELECT id, is_new FROM updated
      UNION ALL
      SELECT id, is_new FROM inserted
    `,
      [component_id, priority, signals.length, title],
    )

    await pgClient.query('COMMIT')
    workItemId = upsertResult.rows[0]!.id
    const isNew = upsertResult.rows[0]!.is_new
    console.log(`[Worker] create-work-item: ${isNew ? 'created' : 'updated'} work item ${workItemId} for ${component_id}`)
  } catch (err) {
    await pgClient.query('ROLLBACK')
    // If this is an unrecoverable schema error, wrap it so BullMQ skips retries
    const pgErr = err as { code?: string }
    if (pgErr.code === '23502' || pgErr.code === '22P02') {
      throw new UnrecoverableError(`PostgreSQL schema mismatch: ${(err as Error).message}`)
    }
    throw err
  } finally {
    pgClient.release()
  }

  // ── Step 3: link signals to work item in Mongo ────────────────────────────
  if (signalIds.length > 0) {
    await Signal.updateMany(
      { signal_id: { $in: signalIds } },
      { $set: { work_item_id: workItemId } },
    )
    console.log(`[Worker] Linked ${signalIds.length} signals to work item ${workItemId}`)
  }

  // ── Step 4: cache work item in Redis ─────────────────────────────────────
  await setWorkItemCache(workItemId, {
    id:           workItemId,
    component_id,
    component_type,
    priority,
    state:        'OPEN',
    signal_count: signals.length,
    updated_at:   new Date().toISOString(),
  })

  // ── Step 5: fire severity-based alert via Strategy Pattern ─────────────────
  await routeAlert(component_type as ComponentType, {
    id:           workItemId,
    component_id,
    state:        'OPEN',
    priority:     priority as 'P0' | 'P1' | 'P2' | 'P3',
    title:        buildTitle(component_id, signals.length),
    signal_count: signals.length,
    created_at:   new Date(),
    updated_at:   new Date(),
  })

  // ── Step 6: increment Redis signal counters ───────────────────────────────
  await Promise.allSettled(
    [...new Set(signals.map((s) => s.component_id))].map((id) => incrementSignalCount(id)),
  )
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let worker: Worker<JobPayload> | null = null

export function startWorker(): void {
  if (worker) {
    console.warn('[Worker] startWorker() called but worker already running — skipping')
    return
  }

  worker = new Worker<JobPayload>(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case JOB_PROCESS_SIGNALS:
          await handleProcessSignals(job.data as ProcessSignalsPayload)
          break

        case JOB_CREATE_WORK_ITEM:
          await handleCreateWorkItem(job.data as CreateWorkItemPayload)
          break

        default:
          // Unknown job type — fail permanently, do not retry
          throw new UnrecoverableError(`Unknown job type: ${job.name}`)
      }
    },
    {
      connection:  { url: config.REDIS_URL },
      concurrency: config.WORKER_CONCURRENCY,
    },
  )

  worker.on('completed', (job) => {
    console.log(`[Worker] ✅ Job ${job.id} (${job.name}) completed`)
  })

  worker.on('failed', (job, err) => {
    const label = job ? `${job.id} (${job.name}) attempt ${job.attemptsMade}` : 'unknown'
    console.error(`[Worker] ❌ Job ${label} failed:`, err.message)
  })

  worker.on('error', (err) => {
    console.error('[Worker] Worker error:', err.message)
  })

  console.log(`[Worker] BullMQ worker started (concurrency=${config.WORKER_CONCURRENCY})`)
}

export async function stopWorker(): Promise<void> {
  if (!worker) return
  await worker.close()
  worker = null
  console.log('[Worker] BullMQ worker stopped')
}
