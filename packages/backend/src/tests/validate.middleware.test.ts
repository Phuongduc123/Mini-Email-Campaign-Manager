/**
 * Unit tests for the Zod validation middleware factory.
 * Verifies request parsing, type coercion, and error formatting.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.middleware';

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

const mockRes = {} as Response;

function captureNext(): { next: NextFunction; calls: unknown[] } {
  const calls: unknown[] = [];
  const next: NextFunction = (arg?: unknown) => {
    calls.push(arg ?? null);
  };
  return { next, calls };
}

// ── Schema for body tests ──────────────────────────────────────────────────────

const bodySchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

// ── validate(schema) — body (default) ─────────────────────────────────────────

describe('validate middleware — body validation', () => {
  it('calls next() with no argument when body is valid', () => {
    const req = makeReq({ body: { name: 'Alice', age: 30 } });
    const { next, calls } = captureNext();

    validate(bodySchema)(req, mockRes, next);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeNull(); // next() with no error
  });

  it('replaces req.body with the parsed (safe) value', () => {
    const req = makeReq({ body: { name: 'Alice', age: 30, extraField: 'ignored' } });
    const { next } = captureNext();

    validate(bodySchema)(req, mockRes, next);

    // Zod strips unknown keys
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
    expect(req.body.extraField).toBeUndefined();
  });

  it('calls next() with a 422 error when body is invalid', () => {
    const req = makeReq({ body: { name: '', age: -5 } }); // name too short, age negative
    const { next, calls } = captureNext();

    validate(bodySchema)(req, mockRes, next);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string; details: unknown[] };
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toBeInstanceOf(Array);
    expect(err.details.length).toBeGreaterThan(0);
  });

  it('formats validation error details with field and message', () => {
    const req = makeReq({ body: { name: '', age: 30 } });
    const { next, calls } = captureNext();

    validate(bodySchema)(req, mockRes, next);

    const err = calls[0] as { details: Array<{ field: string; message: string }> };
    const nameError = err.details.find((d) => d.field === 'name');
    expect(nameError).toBeDefined();
    expect(typeof nameError!.message).toBe('string');
  });

  it('does not modify req.body when validation fails', () => {
    const badBody = { name: 123, age: 'not-a-number' };
    const req = makeReq({ body: badBody });
    const { next } = captureNext();

    validate(bodySchema)(req, mockRes, next);

    // Body should remain unchanged
    expect(req.body).toEqual(badBody);
  });

  it('throws when required fields are missing', () => {
    const req = makeReq({ body: {} }); // no name, no age
    const { next, calls } = captureNext();

    validate(bodySchema)(req, mockRes, next);

    const err = calls[0] as { details: Array<{ field: string }> };
    const fields = err.details.map((d) => d.field);
    expect(fields).toContain('name');
    expect(fields).toContain('age');
  });
});

// ── validate(schema, 'query') — query coercion ────────────────────────────────

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent']).optional(),
});

describe('validate middleware — query coercion', () => {
  it('coerces string "50" to number 50 for limit', () => {
    const req = makeReq({ query: { limit: '50' } as unknown as Request['query'] });
    const { next, calls } = captureNext();

    validate(querySchema, 'query')(req, mockRes, next);

    expect(calls[0]).toBeNull(); // no error
    expect(req.query.limit).toBe(50);
  });

  it('applies default value when limit is absent', () => {
    const req = makeReq({ query: {} });
    const { next, calls } = captureNext();

    validate(querySchema, 'query')(req, mockRes, next);

    expect(calls[0]).toBeNull();
    expect(req.query.limit).toBe(20);
  });

  it('rejects limit > 100 with a 422 error', () => {
    const req = makeReq({ query: { limit: '999' } as unknown as Request['query'] });
    const { next, calls } = captureNext();

    validate(querySchema, 'query')(req, mockRes, next);

    const err = calls[0] as { statusCode: number };
    expect(err.statusCode).toBe(422);
  });

  it('rejects an invalid status enum value', () => {
    const req = makeReq({ query: { status: 'unknown' } as unknown as Request['query'] });
    const { next, calls } = captureNext();

    validate(querySchema, 'query')(req, mockRes, next);

    const err = calls[0] as { code: string };
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a valid status enum value', () => {
    const req = makeReq({ query: { status: 'sent' } as unknown as Request['query'] });
    const { next, calls } = captureNext();

    validate(querySchema, 'query')(req, mockRes, next);

    expect(calls[0]).toBeNull();
    expect((req.query as { status?: string }).status).toBe('sent');
  });
});

// ── validate(schema, 'params') ────────────────────────────────────────────────

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

describe('validate middleware — params validation', () => {
  it('coerces route param string to number', () => {
    const req = makeReq({ params: { id: '42' } });
    const { next, calls } = captureNext();

    validate(paramsSchema, 'params')(req, mockRes, next);

    expect(calls[0]).toBeNull();
    expect((req.params as unknown as { id: number }).id).toBe(42);
  });

  it('rejects a non-numeric id', () => {
    const req = makeReq({ params: { id: 'abc' } });
    const { next, calls } = captureNext();

    validate(paramsSchema, 'params')(req, mockRes, next);

    const err = calls[0] as { statusCode: number };
    expect(err.statusCode).toBe(422);
  });
});
