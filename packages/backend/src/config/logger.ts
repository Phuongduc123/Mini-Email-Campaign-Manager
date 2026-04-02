import { config } from './index';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  event?: string;
  userId?: number;
  campaignId?: number;
  recipientId?: number;
  requestId?: string;
  durationMs?: number;
  err?: string;
  [key: string]: unknown;
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = config.server.nodeEnv === 'production' ? 'info' : 'debug';

function log(level: LogLevel, fields: LogFields, msg: string): void {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;

  const entry = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...fields,
  });

  if (level === 'error') {
    process.stderr.write(entry + '\n');
  } else {
    process.stdout.write(entry + '\n');
  }
}

export const logger = {
  debug: (fields: LogFields, msg: string) => log('debug', fields, msg),
  info:  (fields: LogFields, msg: string) => log('info',  fields, msg),
  warn:  (fields: LogFields, msg: string) => log('warn',  fields, msg),
  error: (fields: LogFields, msg: string) => log('error', fields, msg),
};
