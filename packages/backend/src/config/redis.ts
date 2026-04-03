import Redis from 'ioredis';
import { config } from './index';

/**
 * Factory that creates a new IORedis connection.
 * BullMQ requires separate connections for Queue vs Worker vs QueueEvents,
 * so callers must each create their own instance via this factory.
 */
export function createRedisConnection(): Redis {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,    // required by BullMQ
  });
}
