import { Schema, model, type InferRawDocType } from 'mongoose'

/**
 * Component types that can emit failure signals.
 * Mirrors the domain categories from the implementation plan.
 */
export const COMPONENT_TYPES = ['API', 'MCP_HOST', 'CACHE', 'QUEUE', 'RDBMS', 'NOSQL'] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]

const signalSchemaDefinition = {
  signal_id: { type: String, required: true, unique: true },
  component_id: { type: String, required: true, index: true },
  component_type: { type: String, required: true, enum: COMPONENT_TYPES },
  severity: { type: String, required: true, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
  message: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  work_item_id: { type: String, default: null, index: true },
  timestamp: { type: Date, required: true, index: true },
  ingested_at: { type: Date, default: Date.now },
} as const

const signalSchema = new Schema(signalSchemaDefinition, {
  collection: 'signals',
  timestamps: false, // we manage our own timestamps
  versionKey: false,
})

// Compound index for efficient querying of signals by component over time
signalSchema.index({ component_id: 1, timestamp: -1 })

export type ISignal = InferRawDocType<typeof signalSchemaDefinition>
export const Signal = model('Signal', signalSchema)
