/**
 * Unit tests for RCA validation logic.
 *
 * Verifies that the Zod schema correctly rejects incomplete RCAs,
 * rejects invalid date ranges, and accepts valid payloads.
 */

import { describe, test, expect } from 'bun:test';
import { rcaBodySchema } from '../routes/rca.js';

describe('RCA Validation Schema', () => {
  const validPayload = {
    incident_start: new Date('2026-05-01T10:00:00Z').toISOString(),
    incident_end: new Date('2026-05-01T10:30:00Z').toISOString(),
    root_cause_category: 'APPLICATION',
    fix_applied: 'Rolled back bad deployment',
    prevention_steps: 'Added unit tests for the edge case',
  };

  test('accepts a fully valid RCA payload', () => {
    const result = rcaBodySchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.root_cause_category).toBe('APPLICATION');
      expect(result.data.fix_applied).toBe('Rolled back bad deployment');
    }
  });

  test('rejects incomplete RCA (missing fix_applied)', () => {
    const payload = { ...validPayload };
    // @ts-expect-error - Intentionally modifying for negative test
    delete payload.fix_applied;

    const result = rcaBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('fix_applied'))).toBe(true);
    }
  });

  test('rejects incomplete RCA (missing prevention_steps)', () => {
    const payload = { ...validPayload };
    // @ts-expect-error - Intentionally modifying for negative test
    delete payload.prevention_steps;

    const result = rcaBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('prevention_steps'))).toBe(true);
    }
  });

  test('rejects empty strings for fix_applied and prevention_steps', () => {
    const payload = {
      ...validPayload,
      fix_applied: ' ',
      prevention_steps: '',
    };

    const result = rcaBodySchema.safeParse({
      ...payload,
      fix_applied: '', // exact empty string
    });
    expect(result.success).toBe(false);

    const result2 = rcaBodySchema.safeParse({
      ...payload,
      prevention_steps: '', // exact empty string
    });
    expect(result2.success).toBe(false);
  });

  test('rejects invalid root_cause_category', () => {
    const payload = {
      ...validPayload,
      root_cause_category: 'NOT_A_REAL_CATEGORY',
    };

    const result = rcaBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('root_cause_category'))).toBe(true);
    }
  });

  test('rejects when incident_end is before incident_start', () => {
    const payload = {
      ...validPayload,
      incident_start: new Date('2026-05-01T10:30:00Z').toISOString(),
      incident_end: new Date('2026-05-01T10:00:00Z').toISOString(),
    };

    const result = rcaBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      // The schema refine logic adds the error at the top level, or to a specific path depending on how it's formatted.
      // But we can just verify it fails with the custom message.
      const hasRangeError = result.error.issues.some(
        (i) => i.message === 'incident_end must be after incident_start'
      );
      expect(hasRangeError).toBe(true);
    }
  });

  test('rejects when incident_end equals incident_start', () => {
    const time = new Date('2026-05-01T10:00:00Z').toISOString();
    const payload = {
      ...validPayload,
      incident_start: time,
      incident_end: time,
    };

    const result = rcaBodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
