import { Queue } from 'bullmq'
import { config } from '../config.ts'
import type { SignalInput } from '../ingestion/schema.ts'


export const QUEUE_NAME = 'ims-jobs'

export const JOB_PROCESS_SIGNALS    = 'process-signals'
export const JOB_CREATE_WORK_ITEM   = 'create-work-item'

export interface ProcessSignalsPayload {
  signals: SignalInput[]
}

export interface CreateWorkItemPayload {
  component_id:   string
  component_type: string
  priority:       string
  signals:        SignalInput[]   
}

export type JobPayload = ProcessSignalsPayload | CreateWorkItemPayload


const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1_000,   // 1s, 2s, 4s
  },
  removeOnComplete: { count: 500 },
  removeOnFail:     { count: 200 },
}


/**
 * Single BullMQ Queue used by both producers.
 * BullMQ creates its own internal Redis connections — do NOT share the ioredis
 * client from `db/redis.ts` with it.
 */
export const imsQueue = new Queue<JobPayload>(QUEUE_NAME, {
  connection: { url: config.REDIS_URL },
  defaultJobOptions: DEFAULT_JOB_OPTS,
})

imsQueue.on('error', (err) => {
  console.error('[Queue] BullMQ queue error:', err.message)
})


/**
 * Called by the ring-buffer drain loop (router.ts).
 * Bulk-enqueues raw signals for MongoDB persistence.
 */
export async function enqueueSignalBatch(signals: SignalInput[]): Promise<void> {
  if (signals.length === 0) return

  await imsQueue.add(
    JOB_PROCESS_SIGNALS,
    { signals } satisfies ProcessSignalsPayload,
    { priority: 10 },   // lower urgency than work-item creation
  )

  console.debug(`[Producer] Enqueued process-signals job (${signals.length} signals)`)
}

/**
 * Called by the debouncer flush handler.
 * Creates ONE work-item-creation job carrying all accumulated signals.
 */
export async function enqueueWorkItemCreation(
  component_id:   string,
  component_type: string,
  priority:       string,
  signals:        SignalInput[],
): Promise<void> {
  await imsQueue.add(
    JOB_CREATE_WORK_ITEM,
    { component_id, component_type, priority, signals } satisfies CreateWorkItemPayload,
    { priority: 1 },  
  )

  console.debug(`[Producer] Enqueued create-work-item job for ${component_id} (${signals.length} signals)`)
}

/**
 * Gracefully close the queue connection (call during shutdown).
 */
export async function closeQueue(): Promise<void> {
  await imsQueue.close()
  console.log('[Queue] BullMQ queue closed')
}
