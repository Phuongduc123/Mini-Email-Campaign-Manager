import { Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AuthRequest } from '../shared/types';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

/**
 * Injects a unique request ID into every request.
 * Reads x-request-id from upstream proxy if present, otherwise generates one.
 * Attaches to response header so clients can correlate errors.
 */
export const requestId = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const id = (req.headers['x-request-id'] as string) || `req_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};
