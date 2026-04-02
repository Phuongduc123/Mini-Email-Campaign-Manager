import { Response } from 'express';
import { PaginatedResult } from '../types';

/**
 * Standard API Response Shapes
 *
 * Success (single):   { data: T }
 * Success (list):     { data: T[], meta: { total, page, limit, totalPages } }
 * Success (deleted):  { data: null }
 * Error:              { error: string, message: string, statusCode: number, requestId?: string, details?: [] }
 */

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200): Response =>
  res.status(statusCode).json({ data });

export const sendCreated = <T>(res: Response, data: T): Response =>
  res.status(201).json({ data });

export const sendDeleted = (res: Response): Response =>
  res.status(200).json({ data: null });

export const sendPaginated = <T>(res: Response, result: PaginatedResult<T>): Response => {
  const { items, total, page, limit, totalPages } = result;
  return res.status(200).json({
    data: items,
    meta: { total, page, limit, totalPages },
  });
};
