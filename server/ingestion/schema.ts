import { z } from 'zod/v4'
import { COMPONENT_TYPES } from '../models/Signal.ts'

/**
 * Zod schema for incoming signal payloads on POST /api/signals.
 * This validates the *API input* shape — server-managed fields
 * like `ingested_at` and `work_item_id` are NOT included here.
 */
export const signalSchema = z.object({
  signal_id:      z.string().uuid(),
  component_id:   z.string().min(1, 'component_id must not be empty'),
  component_type: z.enum(COMPONENT_TYPES),
  severity:       z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  message:        z.string().min(1, 'message must not be empty'),
  payload:        z.record(z.string(), z.unknown()).optional().default({}),
  timestamp:      z.coerce.date(),
})

export type SignalInput = z.infer<typeof signalSchema>
