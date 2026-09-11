import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('joins plain class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('lets a later Tailwind utility win over a conflicting earlier one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('');
  });
});
