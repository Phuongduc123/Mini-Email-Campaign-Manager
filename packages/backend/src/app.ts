import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestId } from './middleware/requestId.middleware';
import { logger } from './config/logger';
import { swaggerSpec, swaggerUiOptions } from './config/swagger';

export const createApp = (): Application => {
  const app = express();

  // ── Global middleware ────────────────────────────────────────────
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);

  // ── Request access logging ────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          event: 'http.request',
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
        },
        `${req.method} ${req.path} ${res.statusCode}`,
      );
    });
    next();
  });

  // ── Swagger UI ───────────────────────────────────────────────────
  // Type cast needed: @types/swagger-ui-express bundles its own @types/express causing conflicts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

  // ── Health check ─────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── API routes ────────────────────────────────────────────────────
  app.use('/api/v1', apiRouter);

  // ── Error handling (must be last) ─────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
