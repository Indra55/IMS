import { Router } from 'express'
import { signalSchema } from './schema.ts'
import { signalBuffer } from './ringBuffer.ts'
import { addSignal, setFlushHandler } from './debouncer.ts'
import { signalRateLimiter } from '../middleware/rateLimiter.ts'
import { config } from '../config.ts'
import { enqueueSignalBatch, enqueueWorkItemCreation } from '../queue/producer.ts'
import { COMPONENT_PRIORITY_MAP } from '../models/types.ts'
import type { ComponentType } from '../models/Signal.ts'
import { recordSignalIngestion } from '../observability/metrics.ts'
import { broadcastEvent } from '../websocket/server.ts'

const router = Router()

const DRAIN_INTERVAL_MS = 100
const DRAIN_BATCH_SIZE = 200

// Wire the debouncer flush handler to BullMQ work-item creation
setFlushHandler((componentId, signals) => {
  const componentType = signals[0]?.component_type ?? 'API'
  const priority      = COMPONENT_PRIORITY_MAP[componentType as ComponentType] ?? 'P2'
  enqueueWorkItemCreation(componentId, componentType, priority, signals).catch((err) =>
    console.error(`[Router] Failed to enqueue work-item creation for ${componentId}:`, err),
  )
})

// Drain the ring buffer → debouncer → (async) BullMQ
setInterval(() => {
  const batch = signalBuffer.drain(DRAIN_BATCH_SIZE)
  if (batch.length === 0) return

  // Send raw signals to Mongo via BullMQ for audit-log persistence
  enqueueSignalBatch(batch).catch((err) =>
    console.error('[Router] Failed to enqueue signal batch:', err),
  )

  // Feed each signal through the debouncer (accumulates by component_id)
  for (const signal of batch) {
    addSignal(signal)
  }

  if (batch.length >= 50) {
    broadcastEvent('signal:burst', { count: batch.length, timestamp: new Date().toISOString() })
  }
}, DRAIN_INTERVAL_MS)

router.post('/signals', signalRateLimiter, (req, res) => {
  const result = signalSchema.safeParse(req.body)

  if (!result.success) {
    res.status(400).json({
      error: 'Invalid signal payload',
      details: result.error.issues,
    })
    return
  }

  const signal = result.data

  const accepted = signalBuffer.enqueue(signal)
  if (!accepted) {
    res.status(503).json({
      error: 'Server under backpressure, try again later',
    })
    return
  }

  recordSignalIngestion(1)

  res.status(202).json({
    status: 'accepted',
    signal_id: signal.signal_id,
  })
})

export const ingestionRouter = router
