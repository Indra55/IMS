/**
 * REST routes for Work Item CRUD and state transitions.
 *
 * GET  /api/work-items              — list (filterable by state, priority, component_id)
 * GET  /api/work-items/:id          — single item with linked signal count
 * PATCH /api/work-items/:id/transition — transition state via State Pattern
 * GET  /api/work-items/:id/signals  — linked raw signals from MongoDB
 */

import { Router } from 'express';
import { z } from 'zod/v4';
import { query } from '../db/postgres.js';
import { invalidateWorkItemCache } from '../db/redis.js';
import { Signal } from '../models/Signal.js';
import type { WorkItem, WorkItemState } from '../models/types.js';
import { WorkItemContext } from '../workflow/state.js';

export const workItemsRouter = Router();

// ─── Validation schemas ──────────────────────────────────────────────────────

const VALID_STATES: WorkItemState[] = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

const listQuerySchema = z.object({
  state: z.enum(VALID_STATES as [string, ...string[]]).optional(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  component_id: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const transitionBodySchema = z.object({
  target_state: z.enum(VALID_STATES as [string, ...string[]]),
});

// ─── GET /api/work-items ─────────────────────────────────────────────────────

/** List all work items with optional filters, sorted by priority then created_at. */
workItemsRouter.get('/work-items', async (req, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.issues });
      return;
    }

    const { state, priority, component_id, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (state) {
      conditions.push(`state = $${paramIdx++}`);
      params.push(state);
    }
    if (priority) {
      conditions.push(`priority = $${paramIdx++}`);
      params.push(priority);
    }
    if (component_id) {
      conditions.push(`component_id = $${paramIdx++}`);
      params.push(component_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query for pagination metadata
    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM work_items ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0]!.total, 10);

    // Data query — sort by priority (P0 first) then by newest
    const dataResult = await query<WorkItem>(
      `SELECT * FROM work_items ${whereClause}
       ORDER BY priority ASC, created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[Routes] GET /work-items error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/work-items/:id ─────────────────────────────────────────────────

/** Fetch a single work item with its linked signal count from MongoDB. */
workItemsRouter.get('/work-items/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query<WorkItem>(
      'SELECT * FROM work_items WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: `Work item ${id} not found` });
      return;
    }

    const workItem = result.rows[0]!;

    // Fetch the actual linked signal count from MongoDB
    const linkedSignalCount = await Signal.countDocuments({ work_item_id: id });

    res.json({
      ...workItem,
      linked_signal_count: linkedSignalCount,
    });
  } catch (err) {
    console.error('[Routes] GET /work-items/:id error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/work-items/:id/transition ────────────────────────────────────

/** Transition a work item to a new state using the State Pattern. */
workItemsRouter.patch('/work-items/:id/transition', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = transitionBodySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
      return;
    }

    const { target_state } = parsed.data;

    // Fetch the current work item from PostgreSQL
    const result = await query<WorkItem>(
      'SELECT * FROM work_items WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: `Work item ${id} not found` });
      return;
    }

    const workItem = result.rows[0]!;

    // Delegate to the State Pattern FSM — handles validation, side-effects, and persistence
    const ctx = new WorkItemContext(workItem);
    await ctx.transition(target_state as WorkItemState);

    // Invalidate cached work item so next read fetches fresh state
    await invalidateWorkItemCache(id);

    // Return the updated work item
    const updated = await query<WorkItem>(
      'SELECT * FROM work_items WHERE id = $1',
      [id],
    );

    res.json({
      message: `Transitioned ${workItem.state} → ${target_state}`,
      data: updated.rows[0],
    });
  } catch (err) {
    const message = (err as Error).message;

    // State Pattern throws descriptive errors for invalid transitions and RCA guards
    if (message.includes('Invalid transition') || message.includes('Cannot close')) {
      res.status(409).json({ error: message });
      return;
    }

    console.error('[Routes] PATCH /work-items/:id/transition error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/work-items/:id/signals ─────────────────────────────────────────

/** Fetch linked raw signals from MongoDB for a given work item. */
workItemsRouter.get('/work-items/:id/signals', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify work item exists in PostgreSQL
    const wiResult = await query<WorkItem>(
      'SELECT id FROM work_items WHERE id = $1',
      [id],
    );

    if (wiResult.rows.length === 0) {
      res.status(404).json({ error: `Work item ${id} not found` });
      return;
    }

    // Fetch signals from MongoDB, sorted newest-first
    const signals = await Signal.find({ work_item_id: id })
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      work_item_id: id,
      count: signals.length,
      signals,
    });
  } catch (err) {
    console.error('[Routes] GET /work-items/:id/signals error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
