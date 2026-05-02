/**
 * API-level workflow tests for Work Item transitions and RCA submission.
 *
 * These mount the real Express routers and mock only persistence/cache
 * boundaries, so they verify HTTP status codes and payload behavior without
 * requiring Postgres, MongoDB, or Redis to be running.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Router } from 'express';
import type { RCA, WorkItem } from '../models/types.js';

type TestRca = RCA & { id: string };

const workItems = new Map<string, WorkItem>();
const rcas = new Map<string, TestRca>();

const TEST_WORK_ITEM_ID = '00000000-0000-7000-8000-000000000001';

function makeWorkItem(state: WorkItem['state'] = 'OPEN'): WorkItem {
  return {
    id: TEST_WORK_ITEM_ID,
    component_id: 'PG_PROD_01',
    state,
    priority: 'P0',
    title: 'Incident: PG_PROD_01',
    signal_count: 100,
    created_at: new Date('2026-05-01T10:00:00.000Z'),
    updated_at: new Date('2026-05-01T10:00:00.000Z'),
  };
}

function pgResult<T>(rows: T[], rowCount = rows.length) {
  return {
    rows,
    rowCount,
    command: '',
    oid: 0,
    fields: [],
  };
}

async function queryMock<T>(text: string, params: unknown[] = []) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const id = params[0] as string;

  if (normalized.includes('FROM work_items WHERE id = $1')) {
    const item = workItems.get(id);
    if (!item) return pgResult<T>([]);

    if (normalized.startsWith('SELECT id, state')) {
      return pgResult<T>([{ id: item.id, state: item.state } as T]);
    }

    if (normalized.startsWith('SELECT id FROM work_items')) {
      return pgResult<T>([{ id: item.id } as T]);
    }

    return pgResult<T>([item as T]);
  }

  if (normalized.startsWith('SELECT id FROM rca WHERE work_item_id = $1')) {
    const rca = rcas.get(id);
    return pgResult<T>(rca ? [{ id: rca.id } as T] : []);
  }

  if (normalized.startsWith('SELECT * FROM rca WHERE work_item_id = $1')) {
    const rca = rcas.get(id);
    return pgResult<T>(rca ? [rca as T] : []);
  }

  return pgResult<T>([]);
}

async function clientQueryMock<T>(text: string, params: unknown[] = []) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (normalized.startsWith('BEGIN') || normalized.startsWith('COMMIT') || normalized.startsWith('ROLLBACK')) {
    return pgResult<T>([]);
  }

  if (normalized.startsWith('UPDATE work_items')) {
    const [nextState, id, expectedState] = params as [WorkItem['state'], string, WorkItem['state'], WorkItem['state']];
    const item = workItems.get(id);

    if (!item || item.state !== expectedState) {
      return pgResult<T>([], 0);
    }

    const now = new Date('2026-05-01T10:10:00.000Z');
    workItems.set(id, {
      ...item,
      state: nextState,
      updated_at: now,
      investigating_at: nextState === 'INVESTIGATING' ? item.investigating_at ?? now : item.investigating_at,
      resolved_at: nextState === 'RESOLVED' ? now : item.resolved_at,
    });

    return pgResult<T>([], 1);
  }

  if (normalized.startsWith('INSERT INTO rca')) {
    const [workItemId, incidentStart, incidentEnd, rootCauseCategory, fixApplied, preventionSteps] = params as [
      string,
      Date,
      Date,
      RCA['root_cause_category'],
      string,
      string,
    ];

    const rca: TestRca = {
      id: '00000000-0000-7000-8000-000000000099',
      work_item_id: workItemId,
      incident_start: incidentStart,
      incident_end: incidentEnd,
      root_cause_category: rootCauseCategory,
      fix_applied: fixApplied,
      prevention_steps: preventionSteps,
      mttr_seconds: Math.floor((incidentEnd.getTime() - incidentStart.getTime()) / 1000),
      created_at: new Date('2026-05-01T10:30:00.000Z'),
    };

    rcas.set(workItemId, rca);
    return pgResult<T>([rca as T], 1);
  }

  return pgResult<T>([]);
}

async function poolQueryMock<T>(text: string, params: unknown[] = []) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const id = params[0] as string;

  if (normalized.startsWith('SELECT fix_applied, prevention_steps FROM rca WHERE work_item_id = $1')) {
    const rca = rcas.get(id);
    return pgResult<T>(
      rca
        ? [{ fix_applied: rca.fix_applied, prevention_steps: rca.prevention_steps } as T]
        : [],
    );
  }

  return pgResult<T>([]);
}

mock.module('../db/postgres.ts', () => ({
  query: queryMock,
  pool: {
    query: poolQueryMock,
    connect: async () => ({
      query: clientQueryMock,
      release: () => {},
    }),
  },
}));

mock.module('../db/postgres.js', () => ({
  query: queryMock,
  pool: {
    query: poolQueryMock,
    connect: async () => ({
      query: clientQueryMock,
      release: () => {},
    }),
  },
}));

mock.module('../db/redis.ts', () => ({
  invalidateWorkItemCache: async () => {},
}));

mock.module('../db/redis.js', () => ({
  invalidateWorkItemCache: async () => {},
}));

mock.module('../models/Signal.ts', () => ({
  Signal: {
    countDocuments: async () => 0,
    find: () => ({
      sort: () => ({
        lean: async () => [],
      }),
    }),
  },
}));

mock.module('../models/Signal.js', () => ({
  Signal: {
    countDocuments: async () => 0,
    find: () => ({
      sort: () => ({
        lean: async () => [],
      }),
    }),
  },
}));

mock.module('../websocket/server.ts', () => ({
  broadcastEvent: () => {},
}));

mock.module('../websocket/server.js', () => ({
  broadcastEvent: () => {},
}));

const { workItemsRouter } = await import('../routes/workItems.js');
const { rcaRouter } = await import('../routes/rca.js');

describe('Workflow API integration', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    workItems.clear();
    rcas.clear();
    workItems.set(TEST_WORK_ITEM_ID, makeWorkItem('OPEN'));
  });

  test('rejects invalid transition OPEN -> CLOSED with 409', async () => {
    const res = await routerRequest(workItemsRouter, 'PATCH', `/work-items/${TEST_WORK_ITEM_ID}/transition`, {
      target_state: 'CLOSED',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Invalid transition');
    expect(workItems.get(TEST_WORK_ITEM_ID)?.state).toBe('OPEN');
  });

  test('rejects closing a resolved work item when RCA is missing', async () => {
    workItems.set(TEST_WORK_ITEM_ID, makeWorkItem('RESOLVED'));

    const res = await routerRequest(workItemsRouter, 'PATCH', `/work-items/${TEST_WORK_ITEM_ID}/transition`, {
      target_state: 'CLOSED',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('RCA record is missing');
    expect(workItems.get(TEST_WORK_ITEM_ID)?.state).toBe('RESOLVED');
  });

  test('rejects RCA submission unless work item is RESOLVED', async () => {
    const res = await routerRequest(rcaRouter, 'POST', `/work-items/${TEST_WORK_ITEM_ID}/rca`, {
      incident_start: '2026-05-01T10:00:00.000Z',
      incident_end: '2026-05-01T10:30:00.000Z',
      root_cause_category: 'DATABASE',
      fix_applied: 'Restarted primary database',
      prevention_steps: 'Increase pool monitoring',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('must be RESOLVED');
    expect(rcas.has(TEST_WORK_ITEM_ID)).toBe(false);
  });

  test('rejects incomplete RCA payload with 400', async () => {
    workItems.set(TEST_WORK_ITEM_ID, makeWorkItem('RESOLVED'));

    const res = await routerRequest(rcaRouter, 'POST', `/work-items/${TEST_WORK_ITEM_ID}/rca`, {
      incident_start: '2026-05-01T10:00:00.000Z',
      incident_end: '2026-05-01T10:30:00.000Z',
      root_cause_category: 'DATABASE',
      fix_applied: 'Restarted primary database',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid RCA payload');
    expect(rcas.has(TEST_WORK_ITEM_ID)).toBe(false);
  });

  test('submits valid RCA and then closes the incident', async () => {
    workItems.set(TEST_WORK_ITEM_ID, makeWorkItem('RESOLVED'));

    const rca = await routerRequest(rcaRouter, 'POST', `/work-items/${TEST_WORK_ITEM_ID}/rca`, {
      incident_start: '2026-05-01T10:00:00.000Z',
      incident_end: '2026-05-01T10:30:00.000Z',
      root_cause_category: 'DATABASE',
      fix_applied: 'Restarted primary database',
      prevention_steps: 'Increase pool monitoring',
    });

    expect(rca.status).toBe(201);
    expect(rca.body.data.mttr_seconds).toBe(1800);
    expect(rcas.has(TEST_WORK_ITEM_ID)).toBe(true);

    const close = await routerRequest(workItemsRouter, 'PATCH', `/work-items/${TEST_WORK_ITEM_ID}/transition`, {
      target_state: 'CLOSED',
    });

    expect(close.status).toBe(200);
    expect(close.body.data.state).toBe('CLOSED');
    expect(workItems.get(TEST_WORK_ITEM_ID)?.state).toBe('CLOSED');
  });
});

async function routerRequest(router: Router, method: string, url: string, body?: unknown) {
  const req = {
    method,
    url,
    originalUrl: url,
    baseUrl: '',
    path: url,
    headers: {},
    query: {},
    body,
  } as any;

  let status = 200;

  return await new Promise<{ status: number; body: any }>((resolve, reject) => {
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        resolve({ status, body: payload });
        return this;
      },
      send(payload: unknown) {
        resolve({ status, body: payload });
        return this;
      },
    } as any;

    router.handle(req, res, (err: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve({ status: 404, body: { error: 'Not found' } });
      }
    });
  });
}
