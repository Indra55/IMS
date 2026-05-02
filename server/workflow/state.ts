/**
 * State Pattern — WorkItem finite-state machine.
 *
 * Valid transitions:
 *   OPEN → INVESTIGATING
 *   INVESTIGATING → RESOLVED
 *   INVESTIGATING → OPEN  (re-open)
 *   RESOLVED → CLOSED
 *   RESOLVED → INVESTIGATING  (re-investigate)
 *
 * CLOSED.onEnter() rejects if the work item has no complete RCA.
 */

import { pool } from '../db/postgres.js';
import type { WorkItem, WorkItemState as WorkItemStateName } from '../models/types.js';
import type { WorkItemState } from './types.js';


export class OpenState implements WorkItemState {
  readonly name = 'OPEN';

  canTransitionTo(next: string): boolean {
    return next === 'INVESTIGATING';
  }

  async onEnter(workItem: WorkItem): Promise<void> {
    console.log(`[State] Work item ${workItem.id} entered OPEN`);
  }

  async onExit(workItem: WorkItem): Promise<void> {
    console.log(`[State] Work item ${workItem.id} exiting OPEN`);
  }
}

export class InvestigatingState implements WorkItemState {
  readonly name = 'INVESTIGATING';

  canTransitionTo(next: string): boolean {
    return next === 'RESOLVED' || next === 'OPEN';
  }

  async onEnter(workItem: WorkItem): Promise<void> {
    console.log(`[State] Work item ${workItem.id} entered INVESTIGATING`);
  }

  async onExit(workItem: WorkItem): Promise<void> {
    console.log(`[State] Work item ${workItem.id} exiting INVESTIGATING`);
  }
}

export class ResolvedState implements WorkItemState {
  readonly name = 'RESOLVED';

  canTransitionTo(next: string): boolean {
    return next === 'CLOSED' || next === 'INVESTIGATING';
  }

  async onEnter(workItem: WorkItem): Promise<void> {
    console.log(`[State] Work item ${workItem.id} entered RESOLVED`);
  }

  async onExit(workItem: WorkItem): Promise<void> {
    console.log(`[State] Work item ${workItem.id} exiting RESOLVED`);
  }
}

export class ClosedState implements WorkItemState {
  readonly name = 'CLOSED';

  canTransitionTo(_next: string): boolean {
    return false;
  }

  /**
   * Rejects entry if the RCA is missing or incomplete.
   * Queries PostgreSQL for the rca row linked to this work item.
   */
  async onEnter(workItem: WorkItem): Promise<void> {
    const result = await pool.query<{
      fix_applied: string;
      prevention_steps: string;
    }>(
      `SELECT fix_applied, prevention_steps
         FROM rca
        WHERE work_item_id = $1`,
      [workItem.id],
    );

    if (result.rows.length === 0) {
      throw new Error(
        `Cannot close work item ${workItem.id}: RCA record is missing`,
      );
    }

    const rca = result.rows[0]!;

    if (!rca.fix_applied || rca.fix_applied.trim().length === 0) {
      throw new Error(
        `Cannot close work item ${workItem.id}: RCA fix_applied is empty`,
      );
    }

    if (!rca.prevention_steps || rca.prevention_steps.trim().length === 0) {
      throw new Error(
        `Cannot close work item ${workItem.id}: RCA prevention_steps is empty`,
      );
    }

    console.log(`[State] Work item ${workItem.id} entered CLOSED`);
  }

  async onExit(_workItem: WorkItem): Promise<void> {
    throw new Error('CLOSED is a terminal state — cannot exit');
  }
}

const STATE_MAP: Record<WorkItemStateName, WorkItemState> = {
  OPEN:          new OpenState(),
  INVESTIGATING: new InvestigatingState(),
  RESOLVED:      new ResolvedState(),
  CLOSED:        new ClosedState(),
};

/**
 * Look up the state object by its string name.
 * Throws on unknown state names to catch schema drift early.
 */
export function resolveState(name: WorkItemStateName): WorkItemState {
  const state = STATE_MAP[name];
  if (!state) {
    throw new Error(`Unknown work item state: ${name}`);
  }
  return state;
}

/**
 * Orchestrates state transitions for a single work item.
 *
 * Usage:
 * ```ts
 * const ctx = new WorkItemContext(workItem);
 * await ctx.transition('INVESTIGATING');
 * ```
 *
 * Transition failures (invalid path or RCA guard) throw and leave
 * the work item unchanged — callers should catch and return 409/422.
 */
export class WorkItemContext {
  private currentState: WorkItemState;
  private workItem: WorkItem;

  constructor(workItem: WorkItem) {
    this.workItem = workItem;
    this.currentState = resolveState(workItem.state);
  }

  get stateName(): WorkItemStateName {
    return this.currentState.name as WorkItemStateName;
  }

  /**
   * Transition the work item to `nextStateName`.
   *
   * 1. Validates the transition is allowed from the current state.
   * 2. Runs `currentState.onExit()`.
   * 3. Runs `nextState.onEnter()` — may reject (e.g. CLOSED without RCA).
   * 4. Persists the new state to PostgreSQL with a row-level lock.
   * 5. Updates the in-memory work item.
   */
  async transition(nextStateName: WorkItemStateName): Promise<void> {
    if (!this.currentState.canTransitionTo(nextStateName)) {
      throw new Error(
        `Invalid transition: ${this.currentState.name} → ${nextStateName}`,
      );
    }

    const nextState = resolveState(nextStateName);

    await this.currentState.onExit(this.workItem);
    await nextState.onEnter(this.workItem);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE work_items
            SET state = $1, 
                updated_at = NOW(),
                investigating_at = CASE 
                  WHEN $4 = 'INVESTIGATING' THEN COALESCE(investigating_at, NOW()) 
                  ELSE investigating_at 
                END,
                resolved_at = CASE 
                  WHEN $4 = 'RESOLVED' THEN NOW() 
                  ELSE resolved_at 
                END
          WHERE id = $2
            AND state = $3`,
        [nextStateName, this.workItem.id, this.currentState.name, nextStateName],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const now = new Date();
    this.workItem = {
      ...this.workItem,
      state: nextStateName,
      updated_at: now,
      ...(nextStateName === 'INVESTIGATING' && !this.workItem.investigating_at ? { investigating_at: now } : {}),
      ...(nextStateName === 'RESOLVED' ? { resolved_at: now } : {}),
    };
    this.currentState = nextState;
  }
}
