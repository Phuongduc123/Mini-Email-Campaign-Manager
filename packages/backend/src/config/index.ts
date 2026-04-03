import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  server: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'campaign_manager',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'fallback-secret-do-not-use-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',          // access token — short-lived
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d', // refresh token — long-lived
    refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000,            // 7 days in ms for DB expiresAt
  },
} as const;
