/**
 * Shared TypeScript types for the IMS domain.
 */

import type { ComponentType } from './Signal.ts'

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
