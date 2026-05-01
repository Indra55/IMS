/**
 * REST routes for Root Cause Analysis (RCA) submission and retrieval.
 *
 * POST /api/work-items/:id/rca — submit RCA (validates completeness)
 * GET  /api/work-items/:id/rca — retrieve RCA for a work item
 */

import { Router } from 'express';
import { z } from 'zod/v4';
import { query, pool } from '../db/postgres.js';
import { invalidateWorkItemCache } from '../db/redis.js';
import type { RCA, RootCauseCategory, WorkItem } from '../models/types.js';

export const rcaRouter = Router();

// ─── Validation ──────────────────────────────────────────────────────────────

const ROOT_CAUSE_CATEGORIES: RootCauseCategory[] = [
  'INFRASTRUCTURE',
  'APPLICATION',
  'NETWORK',
  'DATABASE',
  'CACHE',
  'HUMAN_ERROR',
  'THIRD_PARTY',
  'UNKNOWN',
];

export const rcaBodySchema = z
  .object({
    incident_start: z.coerce.date(),
    incident_end: z.coerce.date(),
    root_cause_category: z.enum(ROOT_CAUSE_CATEGORIES as [string, ...string[]]),
    fix_applied: z.string().min(1, 'fix_applied must not be empty'),
    prevention_steps: z.string().min(1, 'prevention_steps must not be empty'),
  })
  .refine(
    (data) => data.incident_end > data.incident_start,
    { message: 'incident_end must be after incident_start' },
  );

// ─── POST /api/work-items/:id/rca ────────────────────────────────────────────

/** Submit an RCA record for a work item. Validates all fields and rejects duplicates. */
rcaRouter.post('/work-items/:id/rca', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate body
    const parsed = rcaBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid RCA payload', details: parsed.error.issues });
      return;
    }

    const { incident_start, incident_end, root_cause_category, fix_applied, prevention_steps } =
      parsed.data;

    // Verify work item exists
    const wiResult = await query<WorkItem>(
      'SELECT id, state FROM work_items WHERE id = $1',
      [id],
    );

    if (wiResult.rows.length === 0) {
      res.status(404).json({ error: `Work item ${id} not found` });
      return;
    }

    // Check for existing RCA (unique constraint on work_item_id)
    const existingRca = await query<{ id: string }>(
      'SELECT id FROM rca WHERE work_item_id = $1',
      [id],
    );

    if (existingRca.rows.length > 0) {
      res.status(409).json({
        error: `RCA already exists for work item ${id}`,
        rca_id: existingRca.rows[0]!.id,
      });
      return;
    }

    // Insert RCA transactionally — mttr_seconds is a PostgreSQL GENERATED column
    const client = await pool.connect();
    let rca: RCA;

    try {
      await client.query('BEGIN');

      const insertResult = await client.query<RCA>(
        `INSERT INTO rca (work_item_id, incident_start, incident_end, root_cause_category, fix_applied, prevention_steps)
         VALUES ($1, $2, $3, $4::root_cause_category, $5, $6)
         RETURNING *`,
        [id, incident_start, incident_end, root_cause_category, fix_applied, prevention_steps],
      );

      rca = insertResult.rows[0]!;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');

      // Handle unique constraint violation gracefully
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        res.status(409).json({ error: `RCA already exists for work item ${id}` });
        return;
      }

      throw err;
    } finally {
      client.release();
    }

    // Invalidate cached work item so dashboards see the RCA association
    await invalidateWorkItemCache(id);

    res.status(201).json({
      message: 'RCA submitted successfully',
      data: rca,
    });
  } catch (err) {
    console.error('[Routes] POST /work-items/:id/rca error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/work-items/:id/rca ─────────────────────────────────────────────

/** Retrieve the RCA record for a work item. */
rcaRouter.get('/work-items/:id/rca', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify work item exists
    const wiResult = await query<{ id: string }>(
      'SELECT id FROM work_items WHERE id = $1',
      [id],
    );

    if (wiResult.rows.length === 0) {
      res.status(404).json({ error: `Work item ${id} not found` });
      return;
    }

    const rcaResult = await query<RCA>(
      'SELECT * FROM rca WHERE work_item_id = $1',
      [id],
    );

    if (rcaResult.rows.length === 0) {
      res.status(404).json({ error: `No RCA found for work item ${id}` });
      return;
    }

    res.json({ data: rcaResult.rows[0] });
  } catch (err) {
    console.error('[Routes] GET /work-items/:id/rca error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
