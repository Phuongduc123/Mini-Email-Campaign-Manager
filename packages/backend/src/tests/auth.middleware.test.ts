/**
 * Unit tests for the JWT authenticate middleware.
 * Uses a real jwt.sign() with a known secret so we avoid over-mocking.
 */

import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../shared/types';

// Must be a literal here — jest.mock() is hoisted and runs before const declarations
jest.mock('../config', () => ({
  config: { jwt: { secret: 'test-middleware-secret' } },
}));

const TEST_SECRET = 'test-middleware-secret';

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeReq(authorizationHeader?: string): AuthRequest {
  return {
    headers: authorizationHeader ? { authorization: authorizationHeader } : {},
  } as unknown as AuthRequest;
}

const mockRes = {} as Response;

function captureNext(): { next: NextFunction; errors: unknown[] } {
  const errors: unknown[] = [];
  const next: NextFunction = (err?: unknown) => {
    errors.push(err ?? null);
  };
  return { next, errors };
}

function signToken(payload: object, options?: jwt.SignOptions): string {
  return jwt.sign(payload, TEST_SECRET, options);
}

// ── Missing / malformed header ─────────────────────────────────────────────────

describe('authenticate middleware — missing/malformed header', () => {
  it('calls next(UnauthorizedError) when Authorization header is absent', () => {
    const req = makeReq();
    const { next, errors } = captureNext();

    authenticate(req, mockRes, next);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  });

  it('calls next(UnauthorizedError) when header does not start with "Bearer "', () => {
    const req = makeReq('Basic sometoken');
    const { next, errors } = captureNext();

    authenticate(req, mockRes, next);

    expect(errors[0]).toMatchObject({ statusCode: 401 });
  });

  it('calls next(UnauthorizedError) when "Bearer " prefix is present but token is empty', () => {
    const req = makeReq('Bearer ');
    const { next, errors } = captureNext();

    authenticate(req, mockRes, next);

    // An empty string is not a valid JWT
    expect(errors[0]).toMatchObject({ statusCode: 401 });
  });
});

// ── Invalid / expired tokens ───────────────────────────────────────────────────

describe('authenticate middleware — invalid tokens', () => {
  it('calls next(UnauthorizedError) when token is a random string', () => {
    const req = makeReq('Bearer notavalidjwt');
    const { next, errors } = captureNext();

    authenticate(req, mockRes, next);

    expect(errors[0]).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  });

  it('calls next(UnauthorizedError) when token is signed with a wrong secret', () => {
    const token = jwt.sign({ id: 1, email: 'alice@example.com' }, 'wrong-secret');
    const req = makeReq(`Bearer ${token}`);
    const { next, errors } = captureNext();

    authenticate(req, mockRes, next);

    expect(errors[0]).toMatchObject({ statusCode: 401 });
  });

  it('calls next(UnauthorizedError) when token is expired', () => {
    const token = signToken({ id: 1, email: 'alice@example.com' }, { expiresIn: '-1s' });
    const req = makeReq(`Bearer ${token}`);
    const { next, errors } = captureNext();

    authenticate(req, mockRes, next);

    expect(errors[0]).toMatchObject({ statusCode: 401 });
  });
});

// ── Valid token ────────────────────────────────────────────────────────────────

describe('authenticate middleware — valid token', () => {
  it('calls next() with no error on a valid token', () => {
    const token = signToken({ id: 7, email: 'alice@example.com' });
    const req = makeReq(`Bearer ${token}`);
    const { next, errors } = captureNext();

    authenticate(req, mockRes, next);

    expect(errors[0]).toBeNull();
  });

  it('attaches the decoded payload to req.user', () => {
    const token = signToken({ id: 7, email: 'alice@example.com' });
    const req = makeReq(`Bearer ${token}`);
    const { next } = captureNext();

    authenticate(req, mockRes, next);

    expect(req.user).toMatchObject({ id: 7, email: 'alice@example.com' });
  });

  it('does not call next() twice', () => {
    const token = signToken({ id: 7, email: 'alice@example.com' });
    const req = makeReq(`Bearer ${token}`);
    const { next, errors } = captureNext();

    authenticate(req, mockRes, next);

    expect(errors).toHaveLength(1);
  });
});
