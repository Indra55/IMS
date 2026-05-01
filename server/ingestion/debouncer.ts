import { type SignalInput } from './schema.ts'
import { config } from '../config.ts'

// ─── Flush handler (swappable for Phase 3 BullMQ integration) ───────────────

type FlushHandler = (componentId: string, signals: SignalInput[]) => void

let onFlush: FlushHandler = (componentId, signals) => {
  console.log(`[Debouncer] Flushed ${signals.length} signals for ${componentId}`)
}

export function setFlushHandler(handler: FlushHandler): void {
  onFlush = handler
}


interface Bucket {
  signals: SignalInput[]
  timer: ReturnType<typeof setTimeout>
  count: number
}

const buckets = new Map<string, Bucket>()



export function addSignal(signal: SignalInput): void {
  const id = signal.component_id
  const existing = buckets.get(id)

  if (!existing) {
    const timer = setTimeout(() => flush(id), config.DEBOUNCE_WINDOW_MS)

    buckets.set(id, {
      signals: [signal],
      timer,
      count: 1,
    })
    return
  }

  existing.signals.push(signal)
  existing.count++

  if (existing.count >= config.DEBOUNCE_THRESHOLD) {
    clearTimeout(existing.timer)
    flush(id)
  }
}

export function flush(componentId: string): void {
  const bucket = buckets.get(componentId)
  if (!bucket || bucket.signals.length === 0) return

  const signals = bucket.signals
  buckets.delete(componentId)

  onFlush(componentId, signals)
}


export function shutdown(): void {
  for (const [componentId, bucket] of buckets) {
    clearTimeout(bucket.timer)
    flush(componentId)
  }
  buckets.clear()
}
