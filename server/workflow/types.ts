/**
 * Shared types for the Workflow Engine (State + Strategy patterns).
 */

import type { WorkItem, Priority } from '../models/types.js';

// ─── State Pattern ──────────────────────────────────────────────────────────

/**
 * Contract for a single state in the WorkItem finite-state machine.
 * Each concrete state decides which transitions are valid and runs
 * side-effects on enter/exit.
 */
export interface WorkItemState {
  /** Human-readable state name (matches the Postgres ENUM value). */
  readonly name: string;

  /** Returns true if transitioning to `next` is allowed from this state. */
  canTransitionTo(next: string): boolean;

  /** Side-effects to run when the work item enters this state. */
  onEnter(workItem: WorkItem): Promise<void>;

  /** Side-effects to run when the work item exits this state. */
  onExit(workItem: WorkItem): Promise<void>;
}

// ─── Strategy Pattern ───────────────────────────────────────────────────────

/**
 * Contract for an alerting strategy.
 * Each component-type maps to exactly one strategy that decides how
 * (and how urgently) to alert responders.
 */
export interface AlertStrategy {
  /** Priority bucket this strategy belongs to. */
  readonly priority: Priority;

  /** Execute the alert for a given work item. */
  alert(workItem: WorkItem): Promise<void>;
}
