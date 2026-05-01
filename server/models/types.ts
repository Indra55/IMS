/**
 * Shared TypeScript types for the IMS domain.
 */

import type { ComponentType, ISignal } from './Signal.ts'

// ─── Work Item (PostgreSQL) ─────────────────────────────────────────────────

export type WorkItemState = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export interface WorkItem {
  id: string
  component_id: string
  state: WorkItemState
  priority: Priority
  title: string
  signal_count: number
  created_at: Date
  updated_at: Date
}

// ─── RCA (PostgreSQL) ───────────────────────────────────────────────────────

export type RootCauseCategory =
  | 'INFRASTRUCTURE'
  | 'APPLICATION'
  | 'NETWORK'
  | 'DATABASE'
  | 'CACHE'
  | 'HUMAN_ERROR'
  | 'THIRD_PARTY'
  | 'UNKNOWN'

export interface RCA {
  id: string
  work_item_id: string
  incident_start: Date
  incident_end: Date
  root_cause_category: RootCauseCategory
  fix_applied: string
  prevention_steps: string
  mttr_seconds: number
  created_at: Date
}

// ─── Priority mapping ───────────────────────────────────────────────────────

export const COMPONENT_PRIORITY_MAP: Record<ComponentType, Priority> = {
  RDBMS: 'P0',
  MCP_HOST: 'P0',
  API: 'P1',
  QUEUE: 'P1',
  CACHE: 'P2',
  NOSQL: 'P3',
} as const

// ─── Debouncer flush types ───────────────────────────────────────────────────

/**
 * Payload handed to the flush handler when a debounce window closes.
 * `signals` is the batch of raw signal payloads accumulated for that window.
 */
export interface FlushPayload {
  component_id: string
  signals: ISignal[]
  flushed_at: Date
}

/**
 * A function that receives a flushed batch and processes it
 * (e.g. upsert a WorkItem, publish to a queue, write metrics, …).
 * Must return a Promise so the debouncer can await it and surface errors.
 */
export type FlushHandler = (payload: FlushPayload) => Promise<void>

/**
 * The active flush handler.  Defaults to a no-op so the debouncer is safe
 * to instantiate before the real handler is wired up.
 */
export let onFlush: FlushHandler = async (_payload) => {}

/**
 * Replace the active flush handler at runtime.
 * Call this once during server bootstrap (or inside tests) before signals
 * start arriving.
 *
 * @example
 * // production wiring
 * setFlushHandler(processSignalBatch)
 *
 * @example
 * // unit-test override
 * const received: FlushPayload[] = []
 * setFlushHandler(async (p) => { received.push(p) })
 */
export function setFlushHandler(handler: FlushHandler): void {
  onFlush = handler
}
