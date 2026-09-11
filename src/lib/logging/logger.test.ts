import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
});

function captureLog() {
  return vi.spyOn(console, 'log').mockImplementation(() => {});
}

describe('logger', () => {
  it('emits structured JSON with level and message', () => {
    const spy = captureLog();
    logger.info('scan started');

    expect(spy).toHaveBeenCalledOnce();
    const entry = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('scan started');
    expect(typeof entry.timestamp).toBe('string');
  });

  it('includes context fields', () => {
    const spy = captureLog();
    logger.info('vehicle read', { vehicleId: 'v1' });

    expect(JSON.parse(spy.mock.calls[0]![0] as string).vehicleId).toBe('v1');
  });

  it('redacts values whose key suggests a secret', () => {
    const spy = captureLog();
    logger.info('sign in', {
      password: 'hunter2',
      accessToken: 'abc',
      apiKey: 'xyz',
      email: 'a@b.com',
    });

    const entry = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(entry.password).toBe('[redacted]');
    expect(entry.accessToken).toBe('[redacted]');
    expect(entry.apiKey).toBe('[redacted]');
    expect(entry.email).toBe('a@b.com');
  });

  it('routes errors to console.error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('connection lost');
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
