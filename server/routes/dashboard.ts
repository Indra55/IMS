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
import { config } from '../config.js';

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
  avg_mtta_seconds: number | null;
  top_components: { component_id: string; count: number }[];
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

    // Average MTTA across all acknowledged incidents
    const mttaResult = await query<{ avg_mtta: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (investigating_at - created_at)))::INT AS avg_mtta 
       FROM work_items 
       WHERE investigating_at IS NOT NULL`,
    );
    const avgMtta = mttaResult.rows[0]?.avg_mtta
      ? parseInt(mttaResult.rows[0].avg_mtta, 10)
      : null;

    // Top Failing Components
    const topComponentsResult = await query<{ component_id: string; count: string }>(
      `SELECT component_id, COUNT(*) AS count 
       FROM work_items 
       GROUP BY component_id 
       ORDER BY count DESC 
       LIMIT 5`,
    );
    const topComponents = topComponentsResult.rows.map(r => ({
      component_id: r.component_id,
      count: parseInt(r.count, 10)
    }));

    const summary: DashboardSummary = {
      state_counts: stateCounts,
      priority_counts: priorityCounts,
      total_work_items: totalWorkItems,
      avg_mttr_seconds: avgMttr,
      avg_mtta_seconds: avgMtta,
      top_components: topComponents,
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

// ─── POST /api/dashboard/ai-summary ──────────────────────────────────────────

/** Generate an AI executive summary based on the current dashboard state. */
dashboardRouter.post('/dashboard/ai-summary', async (_req, res) => {
  try {
    if (!config.OPENROUTER_API_KEY) {
      res.status(503).json({ error: 'AI Summary generation is not configured (OPENROUTER_API_KEY missing)' });
      return;
    }

    // Get current dashboard stats
    const stats: any = await getDashboardState();
    if (!stats) {
      res.status(400).json({ error: 'Dashboard metrics are still initializing. Try again in a few seconds.' });
      return;
    }

    // Build the prompt
    const prompt = `
You are an expert SRE / NOC (Network Operations Center) AI assistant.
Analyze the following real-time incident metrics for our distributed system and provide a concise, executive-level summary of the overall system health. 

Data:
- Total Work Items: ${stats.total_work_items}
- State Breakdown: ${stats.state_counts.OPEN} Open, ${stats.state_counts.INVESTIGATING} Investigating, ${stats.state_counts.RESOLVED} Resolved, ${stats.state_counts.CLOSED} Closed.
- Priority Breakdown: ${stats.priority_counts.P0} P0 (Critical), ${stats.priority_counts.P1} P1, ${stats.priority_counts.P2} P2, ${stats.priority_counts.P3} P3.
- Average MTTA (Time to Acknowledge): ${stats.avg_mtta_seconds ? stats.avg_mtta_seconds + ' seconds' : 'N/A'}
- Average MTTR (Time to Resolve): ${stats.avg_mttr_seconds ? stats.avg_mttr_seconds + ' seconds' : 'N/A'}
- Top Failing Components: ${JSON.stringify(stats.top_components || [])}

Provide a 2 to 3 sentence paragraph. Be professional, direct, and highlight any critical areas of concern (like high P0 counts, open incidents, or long MTTA/MTTR). Do not use markdown headers, just return plain text.
`;

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('[OpenRouter Dashboard] Error:', await response.text());
      res.status(502).json({ error: 'Failed to generate AI summary from provider.' });
      return;
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content || 'No summary could be generated.';

    res.json({ data: content.trim() });
  } catch (err) {
    console.error('[Routes] POST /dashboard/ai-summary error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
