/**
 * Unit tests for the WorkItem state machine (State Pattern).
 *
 * These tests verify transition logic in isolation — they mock
 * the PostgreSQL pool so no real database is required.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import {
  OpenState,
  InvestigatingState,
  ResolvedState,
  ClosedState,
  resolveState,
  WorkItemContext,
} from '../workflow/state.js';
import type { WorkItem } from '../models/types.js';


/** Factory for a minimal WorkItem in the given state. */
function makeWorkItem(state: WorkItem['state'] = 'OPEN'): WorkItem {
  return {
    id: 'test-work-item-001',
    component_id: 'CACHE_CLUSTER_01',
    state,
    priority: 'P2',
    title: 'Test incident',
    signal_count: 5,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

// ─── Mock the PostgreSQL pool ─────────────────────────────────────────────────

// We need to intercept `pool.connect()` and `pool.query()` since
// WorkItemContext.transition() and ClosedState.onEnter() hit Postgres.

const mockRelease = mock(() => {});

const mockClientQuery = mock(async (_text: string, _params?: unknown[]) => ({
  rows: [] as any[],
  rowCount: 0,
  command: '',
  oid: 0,
  fields: [],
}));

const mockPoolQuery = mock(async (_text: string, _params?: unknown[]) => ({
  rows: [] as any[],
  rowCount: 0,
  command: '',
  oid: 0,
  fields: [],
}));

const mockConnect = mock(async () => ({
  query: mockClientQuery,
  release: mockRelease,
}));

// Patch the pool import used by state.ts
mock.module('../db/postgres.ts', () => ({
  pool: {
    connect: mockConnect,
    query: mockPoolQuery,
  },
}));

// ─── OpenState tests ─────────────────────────────────────────────────────────

describe('OpenState', () => {
  const state = new OpenState();

  test('name is OPEN', () => {
    expect(state.name).toBe('OPEN');
  });

  test('can transition to INVESTIGATING', () => {
    expect(state.canTransitionTo('INVESTIGATING')).toBe(true);
  });

  test('cannot transition to RESOLVED', () => {
    expect(state.canTransitionTo('RESOLVED')).toBe(false);
  });

  test('cannot transition to CLOSED', () => {
    expect(state.canTransitionTo('CLOSED')).toBe(false);
  });

  test('cannot transition to OPEN (self)', () => {
    expect(state.canTransitionTo('OPEN')).toBe(false);
  });
});

// ─── InvestigatingState tests ────────────────────────────────────────────────

describe('InvestigatingState', () => {
  const state = new InvestigatingState();

  test('name is INVESTIGATING', () => {
    expect(state.name).toBe('INVESTIGATING');
  });

  test('can transition to RESOLVED', () => {
    expect(state.canTransitionTo('RESOLVED')).toBe(true);
  });

  test('can transition to OPEN (re-open)', () => {
    expect(state.canTransitionTo('OPEN')).toBe(true);
  });

  test('cannot transition to CLOSED', () => {
    expect(state.canTransitionTo('CLOSED')).toBe(false);
  });
});

// ─── ResolvedState tests ─────────────────────────────────────────────────────

describe('ResolvedState', () => {
  const state = new ResolvedState();

  test('name is RESOLVED', () => {
    expect(state.name).toBe('RESOLVED');
  });

  test('can transition to CLOSED', () => {
    expect(state.canTransitionTo('CLOSED')).toBe(true);
  });

  test('can transition to INVESTIGATING (re-investigate)', () => {
    expect(state.canTransitionTo('INVESTIGATING')).toBe(true);
  });

  test('cannot transition to OPEN', () => {
    expect(state.canTransitionTo('OPEN')).toBe(false);
  });
});

// ─── ClosedState tests ───────────────────────────────────────────────────────

describe('ClosedState', () => {
  const state = new ClosedState();

  test('name is CLOSED', () => {
    expect(state.name).toBe('CLOSED');
  });

  test('cannot transition to any state (terminal)', () => {
    expect(state.canTransitionTo('OPEN')).toBe(false);
    expect(state.canTransitionTo('INVESTIGATING')).toBe(false);
    expect(state.canTransitionTo('RESOLVED')).toBe(false);
    expect(state.canTransitionTo('CLOSED')).toBe(false);
  });

  test('onEnter rejects when RCA is missing', async () => {
    const wi = makeWorkItem('RESOLVED');
    // pool.query returns empty rows → no RCA found
    mockPoolQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });

    await expect(state.onEnter(wi)).rejects.toThrow('RCA record is missing');
  });

  test('onEnter rejects when fix_applied is empty', async () => {
    const wi = makeWorkItem('RESOLVED');
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ fix_applied: '', prevention_steps: 'Steps here' }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    await expect(state.onEnter(wi)).rejects.toThrow('fix_applied is empty');
  });

  test('onEnter rejects when prevention_steps is empty', async () => {
    const wi = makeWorkItem('RESOLVED');
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ fix_applied: 'Fix applied', prevention_steps: '' }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    await expect(state.onEnter(wi)).rejects.toThrow(
      'prevention_steps is empty',
    );
  });

  test('onEnter succeeds when RCA is complete', async () => {
    const wi = makeWorkItem('RESOLVED');
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        fix_applied: 'Restarted the cache cluster',
        prevention_steps: 'Added health checks',
      }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    await expect(state.onEnter(wi)).resolves.toBeUndefined();
  });

  test('onExit throws (terminal state)', async () => {
    const wi = makeWorkItem('CLOSED');
    await expect(state.onExit(wi)).rejects.toThrow('terminal state');
  });
});

// ─── resolveState tests ──────────────────────────────────────────────────────

describe('resolveState', () => {
  test('resolves all valid states', () => {
    expect(resolveState('OPEN').name).toBe('OPEN');
    expect(resolveState('INVESTIGATING').name).toBe('INVESTIGATING');
    expect(resolveState('RESOLVED').name).toBe('RESOLVED');
    expect(resolveState('CLOSED').name).toBe('CLOSED');
  });

  test('throws on unknown state', () => {
    expect(() => resolveState('INVALID' as 'OPEN')).toThrow('Unknown');
  });
});

// ─── WorkItemContext integration tests ───────────────────────────────────────

describe('WorkItemContext', () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
    mockConnect.mockReset();
    mockRelease.mockReset();
    mockPoolQuery.mockReset();

    // Re-setup the connect mock after reset
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
  });

  test('valid transition: OPEN → INVESTIGATING persists to Postgres', async () => {
    const wi = makeWorkItem('OPEN');
    const ctx = new WorkItemContext(wi);

    await ctx.transition('INVESTIGATING');

    expect(ctx.stateName).toBe('INVESTIGATING');
    // Should have called BEGIN, UPDATE, COMMIT
    expect(mockClientQuery).toHaveBeenCalledTimes(3);
  });

  test('invalid transition: OPEN → CLOSED throws', async () => {
    const wi = makeWorkItem('OPEN');
    const ctx = new WorkItemContext(wi);

    await expect(ctx.transition('CLOSED')).rejects.toThrow(
      'Invalid transition: OPEN → CLOSED',
    );
    // State should remain unchanged
    expect(ctx.stateName).toBe('OPEN');
  });

  test('invalid transition: OPEN → RESOLVED throws', async () => {
    const wi = makeWorkItem('OPEN');
    const ctx = new WorkItemContext(wi);

    await expect(ctx.transition('RESOLVED')).rejects.toThrow(
      'Invalid transition: OPEN → RESOLVED',
    );
  });

  test('valid path: OPEN → INVESTIGATING → RESOLVED → CLOSED', async () => {
    const wi = makeWorkItem('OPEN');
    const ctx = new WorkItemContext(wi);

    // OPEN → INVESTIGATING
    await ctx.transition('INVESTIGATING');
    expect(ctx.stateName).toBe('INVESTIGATING');

    // Reset mocks between transitions
    mockClientQuery.mockClear();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });

    // INVESTIGATING → RESOLVED
    await ctx.transition('RESOLVED');
    expect(ctx.stateName).toBe('RESOLVED');

    // Reset for CLOSED transition — need pool.query (not client.query) for RCA check
    mockClientQuery.mockClear();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });

    // ClosedState.onEnter() uses pool.query to check RCA
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        fix_applied: 'Patched config',
        prevention_steps: 'Added monitoring',
      }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    // RESOLVED → CLOSED
    await ctx.transition('CLOSED');
    expect(ctx.stateName).toBe('CLOSED');
  });

  test('RESOLVED → CLOSED blocked without RCA', async () => {
    const wi = makeWorkItem('RESOLVED');
    const ctx = new WorkItemContext(wi);

    // ClosedState.onEnter() checks for RCA — return empty
    mockPoolQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });

    await expect(ctx.transition('CLOSED')).rejects.toThrow(
      'RCA record is missing',
    );
    // State should remain RESOLVED on failed transition
    expect(ctx.stateName).toBe('RESOLVED');
  });

  test('re-open: INVESTIGATING → OPEN', async () => {
    const wi = makeWorkItem('INVESTIGATING');
    const ctx = new WorkItemContext(wi);

    await ctx.transition('OPEN');
    expect(ctx.stateName).toBe('OPEN');
  });

  test('re-investigate: RESOLVED → INVESTIGATING', async () => {
    const wi = makeWorkItem('RESOLVED');
    const ctx = new WorkItemContext(wi);

    await ctx.transition('INVESTIGATING');
    expect(ctx.stateName).toBe('INVESTIGATING');
  });
});
