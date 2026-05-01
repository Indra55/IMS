import { Router } from 'express'
import { signalSchema } from './schema.ts'
import { signalBuffer } from './ringBuffer.ts'
import { addSignal } from './debouncer.ts'
import { signalRateLimiter } from '../middleware/rateLimiter.ts'
import { config } from '../config.ts'

const router = Router()

const DRAIN_INTERVAL_MS = 100
const DRAIN_BATCH_SIZE = 200

setInterval(() => {
  const batch = signalBuffer.drain(DRAIN_BATCH_SIZE)
  for (const signal of batch) {
    addSignal(signal)
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

  res.status(202).json({
    status: 'accepted',
    signal_id: signal.signal_id,
  })
})

export const ingestionRouter = router
