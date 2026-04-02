import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Factory that returns an Express middleware validating a specific
 * part of the request against a Zod schema.
 */
export const validate =
  (schema: ZodSchema, part: RequestPart = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const formatted = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      // Attach formatted errors and pass to error middleware
      const err = Object.assign(new Error('Validation failed.'), {
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        isOperational: true,
        details: formatted,
      });

      return next(err);
    }

    // Replace raw value with the parsed (coerced) value
    req[part] = result.data;
    next();
  };
