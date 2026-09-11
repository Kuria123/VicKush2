/**
 * VIN handling (ISO 3779).
 *
 * A deliberate distinction runs through this file:
 *
 * - **Structural validity is a hard rule.** 17 characters drawn from the
 *   permitted alphabet. A string failing this is not a VIN.
 * - **The check digit is only a signal.** Position 9 is mandatory under
 *   FMVSS 565 for vehicles built for North America, but it is NOT part of
 *   ISO 3779 worldwide. Japanese-market vehicles — which dominate the
 *   imported fleet this product targets — frequently carry VINs that do not
 *   satisfy it. Rejecting those would reject genuine vehicles, so a failed
 *   check digit lowers confidence and is surfaced to the user; it never
 *   invalidates the VIN.
 *
 * No manufacturer lookup is performed. Decoding a WMI to a make requires an
 * authoritative table this project does not yet have, and guessing one would
 * fabricate vehicle data (Rule 1). `getWmi` returns the raw code so a real
 * data source can be attached later.
 */

const VIN_LENGTH = 17;

/** I, O and Q are excluded to avoid confusion with 1 and 0. */
const FORBIDDEN_LETTERS = new Set(['I', 'O', 'Q']);
const ALLOWED_CHARACTER = /^[A-HJ-NPR-Z0-9]$/;

/** Transliteration values used by the check-digit algorithm. */
const TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

/** Positional weights; index 8 (the check digit itself) carries weight 0. */
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;

const CHECK_DIGIT_INDEX = 8;

export type VinIssue = 'EMPTY' | 'WRONG_LENGTH' | 'FORBIDDEN_LETTER' | 'INVALID_CHARACTER';

export interface VinAssessment {
  /** Uppercased, with spaces and hyphens removed. */
  normalized: string;
  /** 17 characters from the permitted alphabet. */
  isStructurallyValid: boolean;
  issues: readonly VinIssue[];
  /**
   * Whether position 9 satisfies the North American check digit.
   * `null` when the VIN is not structurally valid, so the question cannot be
   * asked. A `false` is informative, not disqualifying — see the file note.
   */
  checkDigitValid: boolean | null;
  /** World Manufacturer Identifier (first three characters), when available. */
  wmi: string | null;
}

/** Uppercases and strips separators people commonly type or paste. */
export function normalizeVin(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Computes the ISO 3779 check character for a structurally valid VIN.
 * Returns null when the input cannot be scored.
 */
export function computeCheckDigit(vin: string): string | null {
  const normalized = normalizeVin(vin);
  if (normalized.length !== VIN_LENGTH) return null;

  let sum = 0;
  for (let index = 0; index < VIN_LENGTH; index += 1) {
    const character = normalized[index]!;
    const value = /[0-9]/.test(character) ? Number(character) : TRANSLITERATION[character];

    // An unmapped character (I, O, Q or punctuation) makes the sum meaningless.
    if (value === undefined) return null;
    sum += value * WEIGHTS[index]!;
  }

  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/** Full assessment of a candidate VIN. */
export function assessVin(raw: string): VinAssessment {
  const normalized = normalizeVin(raw);
  const issues: VinIssue[] = [];

  if (normalized.length === 0) {
    issues.push('EMPTY');
  } else {
    if (normalized.length !== VIN_LENGTH) issues.push('WRONG_LENGTH');

    let sawForbidden = false;
    let sawInvalid = false;
    for (const character of normalized) {
      if (FORBIDDEN_LETTERS.has(character)) sawForbidden = true;
      else if (!ALLOWED_CHARACTER.test(character)) sawInvalid = true;
    }
    if (sawForbidden) issues.push('FORBIDDEN_LETTER');
    if (sawInvalid) issues.push('INVALID_CHARACTER');
  }

  const isStructurallyValid = issues.length === 0;

  let checkDigitValid: boolean | null = null;
  if (isStructurallyValid) {
    const expected = computeCheckDigit(normalized);
    checkDigitValid = expected === null ? null : normalized[CHECK_DIGIT_INDEX] === expected;
  }

  return {
    normalized,
    isStructurallyValid,
    issues,
    checkDigitValid,
    wmi: isStructurallyValid ? normalized.slice(0, 3) : null,
  };
}

/** Convenience predicate for the hard rule only. */
export function isStructurallyValidVin(raw: string): boolean {
  return assessVin(raw).isStructurallyValid;
}

export const VIN_ISSUE_MESSAGES: Record<VinIssue, string> = {
  EMPTY: 'Enter a VIN.',
  WRONG_LENGTH: 'A VIN is exactly 17 characters.',
  FORBIDDEN_LETTER: 'A VIN never contains the letters I, O or Q.',
  INVALID_CHARACTER: 'A VIN contains only letters and digits.',
};
