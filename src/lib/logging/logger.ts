export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minimumLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVEL_ORDER) return configured;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * Redacts values whose key suggests a secret. Diagnostic payloads routinely
 * pass through this logger, so credentials must never be serialised by
 * accident.
 */
const SENSITIVE_KEY = /pass|secret|token|authorization|cookie|key$/i;

function redact(context: LogContext): LogContext {
  const out: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : value;
  }
  return out;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel()]) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? redact(context) : {}),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};
