import { describe, expect, it } from 'vitest';

import { assessVin, computeCheckDigit, isStructurallyValidVin, normalizeVin } from './vin';

/**
 * 1M8GDM9AXKP042788 is the worked example from the ISO 3779 / FMVSS 565
 * literature, whose check digit is X. Using a known-correct fixture means the
 * algorithm is verified against the standard rather than against itself.
 */
const REFERENCE_VIN = '1M8GDM9AXKP042788';

describe('normalizeVin', () => {
  it('uppercases', () => {
    expect(normalizeVin('1m8gdm9axkp042788')).toBe(REFERENCE_VIN);
  });

  it('strips spaces and hyphens people paste in', () => {
    expect(normalizeVin(' 1M8-GDM9AX KP042788 ')).toBe(REFERENCE_VIN);
  });
});

describe('computeCheckDigit', () => {
  it('reproduces the reference check digit', () => {
    expect(computeCheckDigit(REFERENCE_VIN)).toBe('X');
  });

  it('returns null for the wrong length', () => {
    expect(computeCheckDigit('12345')).toBeNull();
  });

  it('returns null when a character has no transliteration', () => {
    // 'I' is not in the table; the sum would be meaningless.
    expect(computeCheckDigit('1I8GDM9AXKP042788')).toBeNull();
  });

  it('is deterministic', () => {
    expect(computeCheckDigit(REFERENCE_VIN)).toBe(computeCheckDigit(REFERENCE_VIN));
  });
});

describe('assessVin — structure', () => {
  it('accepts the reference VIN', () => {
    const result = assessVin(REFERENCE_VIN);
    expect(result.isStructurallyValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports an empty input', () => {
    expect(assessVin('   ').issues).toContain('EMPTY');
  });

  it('reports the wrong length', () => {
    expect(assessVin('1M8GDM9AXKP04278').issues).toContain('WRONG_LENGTH');
  });

  it.each(['I', 'O', 'Q'])('rejects the forbidden letter %s', (letter) => {
    const vin = `1M8GDM9AXKP04278${letter}`;
    expect(assessVin(vin).issues).toContain('FORBIDDEN_LETTER');
    expect(assessVin(vin).isStructurallyValid).toBe(false);
  });

  it('reports punctuation as an invalid character', () => {
    expect(assessVin('1M8GDM9AXKP04278*').issues).toContain('INVALID_CHARACTER');
  });

  it('exposes the WMI only for a structurally valid VIN', () => {
    expect(assessVin(REFERENCE_VIN).wmi).toBe('1M8');
    expect(assessVin('too-short').wmi).toBeNull();
  });
});

describe('assessVin — check digit', () => {
  it('confirms a matching check digit', () => {
    expect(assessVin(REFERENCE_VIN).checkDigitValid).toBe(true);
  });

  it('reports a mismatch without invalidating the VIN', () => {
    // Position 9 changed from X to 0: still structurally a VIN.
    const mismatched = '1M8GDM9A0KP042788';
    const result = assessVin(mismatched);

    expect(result.isStructurallyValid).toBe(true);
    expect(result.checkDigitValid).toBe(false);
    // This is the JDM-import case and must never be treated as invalid.
    expect(result.issues).toEqual([]);
  });

  it('cannot evaluate the check digit of a structurally invalid VIN', () => {
    expect(assessVin('SHORT').checkDigitValid).toBeNull();
  });
});

describe('isStructurallyValidVin', () => {
  it('ignores the check digit entirely', () => {
    expect(isStructurallyValidVin('1M8GDM9A0KP042788')).toBe(true);
  });
});
