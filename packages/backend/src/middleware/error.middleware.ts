import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

interface ExtendedError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: unknown;
}

/**
 * Global error handler — must be registered last in Express.
 *
 * Error response shape:
 * {
 *   "error":     "ERROR_CODE",
 *   "message":   "Human-readable description.",
 *   "statusCode": 4xx | 5xx,
 *   "requestId": "req_xxxx",
 *   "details":   [{ "field": "email", "message": "Invalid email" }]  // validation only
 * }
 */
export const errorHandler = (
  err: ExtendedError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const isOperational = err.isOperational ?? false;
  const message = isOperational ? err.message : 'An unexpected error occurred.';
  const requestId = (req as any).requestId;

  if (!isOperational) {
    logger.error(
      { event: 'unhandled_error', requestId, err: err.stack },
      'Unhandled server error',
    );
  }

  const body: Record<string, unknown> = { error: code, message, statusCode, requestId };

  // Attach validation details when present (from validate.middleware)
  if (err.details) {
    body.details = err.details;
  }

  res.status(statusCode).json(body);
};

export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction): void => {
  const err = Object.assign(new Error('Route not found.'), {
    statusCode: 404,
    code: 'NOT_FOUND',
    isOperational: true,
  });
  next(err);
};
