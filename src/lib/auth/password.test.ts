import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('never returns the plaintext', async () => {
    const hash = await hashPassword('Diagnostic1');
    expect(hash).not.toBe('Diagnostic1');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('Diagnostic1');
    await expect(verifyPassword('Diagnostic1', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Diagnostic1');
    await expect(verifyPassword('Diagnostic2', hash)).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('Diagnostic1'),
      hashPassword('Diagnostic1'),
    ]);
    expect(a).not.toBe(b);
  });
});
