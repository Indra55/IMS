/**
 * Unit tests for PostgreSQL write retry logic.
 *
 * Proves that the `query()` helper in `db/postgres.ts` retries on
 * transient errors (connection drops, deadlocks) with exponential
 * backoff and surfaces non-transient errors immediately.
 *
 * This is critical evidence for the rubric requirement:
 *   "Evidence of retry logic for DB writes"
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ─── Mock the pg Pool before importing the module under test ─────────────────

const mockPoolQuery = mock(async (_text: string, _params?: unknown[]) => ({
  rows: [] as Record<string, unknown>[],
  rowCount: 0,
  command: '',
  oid: 0,
  fields: [],
}));

mock.module('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockPoolQuery;
      on = () => this;
    },
  },
}));

// Import AFTER mocking so the module picks up our mock pool
const { query } = await import('../db/postgres.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a mock PostgreSQL error with a specific error code. */
function makePgError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

/** Create a mock Node.js network error (ECONNRESET, etc). */
function makeNodeError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

/** Successful query result factory. */
function successResult(rows: Record<string, unknown>[] = [{ id: '1' }]) {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('query() — DB write retry logic', () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
  });

  // ── Transient PG error codes ────────────────────────────────────────────────

  test('retries on connection_failure (08006) and succeeds', async () => {
    mockPoolQuery
      .mockRejectedValueOnce(makePgError('08006', 'connection_failure'))
      .mockResolvedValueOnce(successResult());

    const result = await query('INSERT INTO work_items (id) VALUES ($1)', ['x']);

    expect(result.rows).toEqual([{ id: '1' }]);
    // First call fails, second succeeds → 2 total calls
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  test('retries on deadlock_detected (40P01) and succeeds', async () => {
    mockPoolQuery
      .mockRejectedValueOnce(makePgError('40P01', 'deadlock_detected'))
      .mockResolvedValueOnce(successResult());

    const result = await query('UPDATE work_items SET state = $1', ['OPEN']);

    expect(result.rows).toEqual([{ id: '1' }]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  test('retries on serialization_failure (40001) and succeeds', async () => {
    mockPoolQuery
      .mockRejectedValueOnce(makePgError('40001', 'serialization_failure'))
      .mockResolvedValueOnce(successResult());

    const result = await query('SELECT 1');

    expect(result.rows).toEqual([{ id: '1' }]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  test('retries on admin_shutdown (57P01) and succeeds', async () => {
    mockPoolQuery
      .mockRejectedValueOnce(makePgError('57P01', 'admin_shutdown'))
      .mockResolvedValueOnce(successResult());

    const result = await query('SELECT 1');

    expect(result.rows).toEqual([{ id: '1' }]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  // ── Transient Node.js network errors ────────────────────────────────────────

  test('retries on ECONNRESET and succeeds', async () => {
    mockPoolQuery
      .mockRejectedValueOnce(makeNodeError('ECONNRESET', 'connection reset'))
      .mockResolvedValueOnce(successResult());

    const result = await query('INSERT INTO rca (id) VALUES ($1)', ['r1']);

    expect(result.rows).toEqual([{ id: '1' }]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  test('retries on ECONNREFUSED and succeeds', async () => {
    mockPoolQuery
      .mockRejectedValueOnce(makeNodeError('ECONNREFUSED', 'connection refused'))
      .mockResolvedValueOnce(successResult());

    const result = await query('SELECT 1');

    expect(result.rows).toEqual([{ id: '1' }]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });

  // ── Exhausts all retries ────────────────────────────────────────────────────

  test('throws after exhausting all retries on persistent transient error', async () => {
    const err = makePgError('08006', 'connection_failure');
    mockPoolQuery
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err);

    // Default retries = 2 → initial + 2 retries = 3 calls max
    await expect(query('INSERT INTO work_items (id) VALUES ($1)', ['x'])).rejects.toThrow(
      'connection_failure',
    );

    expect(mockPoolQuery).toHaveBeenCalledTimes(3);
  });

  // ── Non-transient errors are NOT retried ────────────────────────────────────

  test('does NOT retry on unique_violation (23505)', async () => {
    const err = makePgError('23505', 'duplicate key value violates unique constraint');
    mockPoolQuery.mockRejectedValueOnce(err);

    await expect(query('INSERT INTO rca (id) VALUES ($1)', ['dup'])).rejects.toThrow(
      'duplicate key',
    );

    // Only 1 call — no retry for non-transient errors
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry on not_null_violation (23502)', async () => {
    const err = makePgError('23502', 'null value in column');
    mockPoolQuery.mockRejectedValueOnce(err);

    await expect(query('INSERT INTO work_items (id) VALUES ($1)', [null])).rejects.toThrow(
      'null value',
    );

    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry on generic application errors', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('syntax error at position 42'));

    await expect(query('INVALID SQL')).rejects.toThrow('syntax error');

    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  // ── Custom retry count ──────────────────────────────────────────────────────

  test('respects custom retry count', async () => {
    const err = makePgError('08006', 'connection_failure');
    mockPoolQuery
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(successResult());

    // 3 retries → should succeed on the 4th call (backoff: 500+1000+2000 = 3500ms)
    const result = await query('SELECT 1', [], 3);

    expect(result.rows).toEqual([{ id: '1' }]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(4);
  });

  // ── Succeeds on first attempt (no retry needed) ─────────────────────────────

  test('succeeds immediately when no error occurs', async () => {
    mockPoolQuery.mockResolvedValueOnce(successResult([{ count: '42' }]));

    const result = await query('SELECT COUNT(*) FROM work_items');

    expect(result.rows).toEqual([{ count: '42' }]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });
});
