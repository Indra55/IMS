/**
 * Dashboard aggregate endpoints — served from Redis cache where possible.
 *
 * GET /api/dashboard/summary    — counts by state/priority + avg MTTR
 * GET /api/dashboard/timeseries — signals over time (MongoDB aggregation)
 */

import { Router } from 'express';
import { z } from 'zod/v4';
import { query } from '../db/postgres.js';
import { getDashboardState, setDashboardState } from '../db/redis.js';
import { Signal } from '../models/Signal.js';

export const dashboardRouter = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface StateCounts {
  OPEN: number;
  INVESTIGATING: number;
  RESOLVED: number;
  CLOSED: number;
}

interface PriorityCounts {
  P0: number;
  P1: number;
  P2: number;
  P3: number;
}

interface DashboardSummary {
  state_counts: StateCounts;
  priority_counts: PriorityCounts;
  total_work_items: number;
  avg_mttr_seconds: number | null;
  generated_at: string;
}

// ─── GET /api/dashboard/summary ──────────────────────────────────────────────

/** Counts by state and priority, plus average MTTR. Served from Redis cache first. */
dashboardRouter.get('/dashboard/summary', async (_req, res) => {
  try {
    // Try the Redis cache first
    const cached = await getDashboardState();
    if (cached) {
      res.json({ data: cached, source: 'cache' });
      return;
    }

    // Cache miss — compute from PostgreSQL
    const stateResult = await query<{ state: string; count: string }>(
      `SELECT state, COUNT(*) AS count FROM work_items GROUP BY state`,
    );

    const stateCounts: StateCounts = { OPEN: 0, INVESTIGATING: 0, RESOLVED: 0, CLOSED: 0 };
    let totalWorkItems = 0;

    for (const row of stateResult.rows) {
      const count = parseInt(row.count, 10);
      stateCounts[row.state as keyof StateCounts] = count;
      totalWorkItems += count;
    }

    const priorityResult = await query<{ priority: string; count: string }>(
      `SELECT priority, COUNT(*) AS count FROM work_items GROUP BY priority`,
    );

    const priorityCounts: PriorityCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const row of priorityResult.rows) {
      priorityCounts[row.priority as keyof PriorityCounts] = parseInt(row.count, 10);
    }

    // Average MTTR across all closed incidents with an RCA
    const mttrResult = await query<{ avg_mttr: string | null }>(
      `SELECT AVG(mttr_seconds)::INT AS avg_mttr FROM rca`,
    );
    const avgMttr = mttrResult.rows[0]?.avg_mttr
      ? parseInt(mttrResult.rows[0].avg_mttr, 10)
      : null;

    const summary: DashboardSummary = {
      state_counts: stateCounts,
      priority_counts: priorityCounts,
      total_work_items: totalWorkItems,
      avg_mttr_seconds: avgMttr,
      generated_at: new Date().toISOString(),
    };

    // Cache the computed summary in Redis (60s TTL set by helper)
    await setDashboardState(summary as unknown as Record<string, unknown>);

    res.json({ data: summary, source: 'database' });
  } catch (err) {
    console.error('[Routes] GET /dashboard/summary error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/dashboard/timeseries ───────────────────────────────────────────

const VALID_INTERVALS = ['1m', '5m', '15m', '1h', '6h', '1d'] as const;

const timeseriesQuerySchema = z.object({
  interval: z.enum(VALID_INTERVALS).default('5m'),
  range: z.enum(['1h', '6h', '12h', '1d', '7d']).default('1h'),
});

/** Map human-readable interval/range strings to milliseconds. */
function parseIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1m':  60_000,
    '5m':  300_000,
    '15m': 900_000,
    '1h':  3_600_000,
    '6h':  21_600_000,
    '1d':  86_400_000,
  };
  return map[interval] ?? 300_000;
}

function parseRangeMs(range: string): number {
  const map: Record<string, number> = {
    '1h':  3_600_000,
    '6h':  21_600_000,
    '12h': 43_200_000,
    '1d':  86_400_000,
    '7d':  604_800_000,
  };
  return map[range] ?? 3_600_000;
}

/** Signals over time, aggregated from MongoDB using aggregation pipeline. */
dashboardRouter.get('/dashboard/timeseries', async (req, res) => {
  try {
    const parsed = timeseriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.issues });
      return;
    }

    const { interval, range } = parsed.data;
    const intervalMs = parseIntervalMs(interval);
    const rangeMs = parseRangeMs(range);
    const startDate = new Date(Date.now() - rangeMs);

    // MongoDB aggregation: bucket signals by time intervals
    const buckets = await Signal.aggregate<{
      _id: Date;
      count: number;
      severities: Record<string, number>;
    }>([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [
                { $toLong: '$timestamp' },
                { $mod: [{ $toLong: '$timestamp' }, intervalMs] },
              ],
            },
          },
          count: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ['$severity', 'MEDIUM'] }, 1, 0] } },
          low: { $sum: { $cond: [{ $eq: ['$severity', 'LOW'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          timestamp: '$_id',
          count: 1,
          severities: {
            CRITICAL: '$critical',
            HIGH: '$high',
            MEDIUM: '$medium',
            LOW: '$low',
          },
        },
      },
    ]);

    res.json({
      interval,
      range,
      start: startDate.toISOString(),
      end: new Date().toISOString(),
      data: buckets,
    });
  } catch (err) {
    console.error('[Routes] GET /dashboard/timeseries error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
