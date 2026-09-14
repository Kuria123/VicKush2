import { describe, expect, it } from 'vitest';

import {
  MAX_CONFIDENCE_BY_BASIS,
  MINIMUM_CONFIDENCE,
  hasAnyProposal,
  interpretRecognition,
  type RawClaim,
  type RawRecognition,
} from './engine';
import { RECOGNITION_SYSTEM_PROMPT } from './prompt';

/**
 * The grounding check for vision.
 *
 * These tests are almost entirely about refusal. A vision model asked what car
 * this is will answer, always, because answering is what it is for — so the
 * question here is never "does it recognise a Harrier", it is "what happens
 * when it is confidently wrong", which is the case that reaches a mechanic.
 */

const NOW = new Date('2026-06-01T00:00:00Z');

// A real-format VIN: 17 characters, no I, O or Q.
const VALID_VIN = 'JTMHV05J804123456';

function claim(overrides: Partial<RawClaim> = {}): RawClaim {
  return {
    field: 'make',
    value: 'Toyota',
    basis: 'READ_FROM_BADGE',
    confidence: 80,
    observation: 'The grille carries a Toyota emblem.',
    ...overrides,
  };
}

function raw(claims: RawClaim[], imagesExamined = 1): RawRecognition {
  return { imagesExamined, claims };
}

describe('a VIN', () => {
  it('is accepted when it is read and structurally valid', () => {
    const result = interpretRecognition(
      raw([claim({ field: 'vin', value: VALID_VIN, basis: 'READ_FROM_TEXT', confidence: 90 })]),
      NOW,
    );

    expect(result.proposed.vin.established).toBe(true);
    if (result.proposed.vin.established) {
      expect(result.proposed.vin.value).toBe(VALID_VIN);
      expect(result.proposed.vin.basis).toBe('READ_FROM_TEXT');
    }
  });

  it('is refused when it cannot be a VIN, however confident the model was', () => {
    /*
     * The failure this whole file exists for. A model looking at a blurred
     * door jamb produces seventeen plausible characters because that is what
     * it was asked for, and a fabricated VIN is worth twenty points of
     * identification evidence and gets printed on a mechanic's report.
     */
    const result = interpretRecognition(
      raw([
        claim({ field: 'vin', value: 'NOT-A-REAL-VIN', basis: 'READ_FROM_TEXT', confidence: 99 }),
      ]),
      NOW,
    );

    expect(result.proposed.vin.established).toBe(false);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(/structurally valid VIN/i);
    // Rule 3: the refusal is kept, so how often this happens is visible.
    expect(result.rejected[0]?.claimed).toBe('NOT-A-REAL-VIN');
  });

  it('is refused outright when it was inferred rather than read', () => {
    const result = interpretRecognition(
      raw([
        claim({
          field: 'vin',
          value: VALID_VIN,
          basis: 'INFERRED_FROM_APPEARANCE',
          confidence: 95,
        }),
      ]),
      NOW,
    );

    // Structurally perfect and still refused: no bodywork implies a VIN, so a
    // VIN arriving by that route was invented whatever it looks like.
    expect(result.proposed.vin.established).toBe(false);
    expect(result.rejected[0]?.reason).toMatch(/cannot be inferred/i);
  });

  it('is refused when it is seventeen characters of the wrong alphabet', () => {
    // I, O and Q are excluded from VINs precisely because they read as 1, 0
    // and 0 — the characters a model is most likely to get wrong.
    const result = interpretRecognition(
      raw([claim({ field: 'vin', value: 'JTMHV05J8O4123456', basis: 'READ_FROM_TEXT' })]),
      NOW,
    );

    expect(result.proposed.vin.established).toBe(false);
  });
});

describe('confidence', () => {
  it('is capped by how the claim was arrived at', () => {
    const result = interpretRecognition(
      raw([
        claim({
          field: 'year',
          value: '2018',
          basis: 'INFERRED_FROM_APPEARANCE',
          confidence: 100,
        }),
      ]),
      NOW,
    );

    expect(result.proposed.year.established).toBe(true);
    if (result.proposed.year.established) {
      // No photograph of bodywork establishes a model year. A number above the
      // ceiling would be claiming otherwise, however sure the model sounded.
      expect(result.proposed.year.confidence).toBe(
        MAX_CONFIDENCE_BY_BASIS.INFERRED_FROM_APPEARANCE,
      );
    }
  });

  it('is never raised, only lowered', () => {
    const result = interpretRecognition(
      raw([claim({ confidence: 62, basis: 'READ_FROM_BADGE' })]),
      NOW,
    );

    if (result.proposed.make.established) {
      expect(result.proposed.make.confidence).toBeLessThanOrEqual(62);
    }
  });

  it('drops a claim the model was not sure of rather than offering it', () => {
    const result = interpretRecognition(
      raw([claim({ field: 'model', value: 'Harrier', confidence: MINIMUM_CONFIDENCE - 1 })]),
      NOW,
    );

    // An unsure suggestion sitting in a form field becomes an asserted fact by
    // way of a confirmation nobody read carefully.
    expect(result.proposed.model.established).toBe(false);
    expect(result.rejected[0]?.reason).toMatch(/too uncertain/i);
  });

  it('treats a negative or absurd confidence as a number, not a crash', () => {
    const low = interpretRecognition(raw([claim({ confidence: -40 })]), NOW);
    const high = interpretRecognition(raw([claim({ confidence: 400 })]), NOW);

    expect(low.proposed.make.established).toBe(false);
    expect(high.proposed.make.established).toBe(true);
    if (high.proposed.make.established) {
      expect(high.proposed.make.confidence).toBe(MAX_CONFIDENCE_BY_BASIS.READ_FROM_BADGE);
    }
  });
});

describe('a year', () => {
  it('accepts next year, because new models are registered ahead of the calendar', () => {
    const result = interpretRecognition(
      raw([claim({ field: 'year', value: '2027', basis: 'READ_FROM_TEXT' })]),
      NOW,
    );

    expect(result.proposed.year.established).toBe(true);
  });

  it('refuses a year beyond that, and one before vehicles had VINs', () => {
    for (const value of ['2031', '1901', '20188', 'twenty eighteen']) {
      const result = interpretRecognition(
        raw([claim({ field: 'year', value, basis: 'READ_FROM_TEXT' })]),
        NOW,
      );
      expect(result.proposed.year.established, value).toBe(false);
    }
  });
});

describe('enumerated fields', () => {
  it('accept a value the product actually has', () => {
    const result = interpretRecognition(
      raw([
        claim({ field: 'fuelType', value: 'hybrid petrol', basis: 'READ_FROM_BADGE' }),
        claim({ field: 'transmissionType', value: 'CVT', basis: 'READ_FROM_BADGE' }),
      ]),
      NOW,
    );

    expect(result.proposed.fuelType.established).toBe(true);
    if (result.proposed.fuelType.established) {
      expect(result.proposed.fuelType.value).toBe('HYBRID_PETROL');
    }
  });

  it('refuse an invented one rather than storing free text', () => {
    const result = interpretRecognition(
      raw([claim({ field: 'fuelType', value: 'Mild Hybrid 48V', basis: 'READ_FROM_BADGE' })]),
      NOW,
    );

    expect(result.proposed.fuelType.established).toBe(false);
    expect(result.rejected[0]?.reason).toMatch(/not a fuel type/i);
  });
});

describe('two claims about one field', () => {
  it('keeps the first and records the second as unresolved', () => {
    const result = interpretRecognition(
      raw([
        claim({ field: 'model', value: 'Harrier', confidence: 70 }),
        claim({ field: 'model', value: 'Lexus RX', confidence: 90 }),
      ]),
      NOW,
    );

    // Taking the more confident one would be resolving a disagreement this
    // build cannot resolve — and these two really are the same vehicle with
    // different badges, which is the case that makes it undecidable.
    expect(result.proposed.model.established).toBe(true);
    if (result.proposed.model.established) expect(result.proposed.model.value).toBe('Harrier');
    expect(result.rejected.some((r) => r.claimed === 'Lexus RX')).toBe(true);
  });
});

describe('a field nothing was said about', () => {
  it('carries the reason nothing was established, not a blank', () => {
    const result = interpretRecognition(raw([]), NOW);

    for (const [name, proposal] of Object.entries(result.proposed)) {
      expect(proposal.established, name).toBe(false);
      if (!proposal.established) expect(proposal.reason.length, name).toBeGreaterThan(0);
    }
  });

  it('says a photograph cannot date a vehicle, rather than leaving it empty', () => {
    const result = interpretRecognition(raw([]), NOW);
    if (!result.proposed.year.established) {
      expect(result.proposed.year.reason).toMatch(/does not establish a model year/i);
    }
  });
});

describe('limitations', () => {
  it('always say nothing is saved until the owner confirms it', () => {
    const result = interpretRecognition(
      raw([claim({ field: 'vin', value: VALID_VIN, basis: 'READ_FROM_TEXT' })]),
      NOW,
    );

    expect(result.limitations[0]).toMatch(/saved until you confirm/i);
  });

  it('always say what a photograph cannot establish', () => {
    const result = interpretRecognition(raw([claim()]), NOW);
    expect(result.limitations.join(' ')).toMatch(/cannot establish engine size/i);
  });

  it('are never empty, even with nothing examined', () => {
    const result = interpretRecognition(raw([], 0), NOW);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations.join(' ')).toMatch(/No images were examined/i);
  });
});

describe('hasAnyProposal', () => {
  it('is false when nothing survived, so the screen can say so', () => {
    // Eight rows of "not established" is a failure, not a result, and
    // rendering it as one implies the vehicle was examined and found blank.
    expect(hasAnyProposal(interpretRecognition(raw([]), NOW))).toBe(false);
  });

  it('is true as soon as one field stands', () => {
    expect(hasAnyProposal(interpretRecognition(raw([claim()]), NOW))).toBe(true);
  });
});

describe('the prompt', () => {
  it('tells the model to separate what it read from what it inferred', () => {
    expect(RECOGNITION_SYSTEM_PROMPT).toContain('READ_FROM_TEXT');
    expect(RECOGNITION_SYSTEM_PROMPT).toContain('INFERRED_FROM_APPEARANCE');
  });

  it('warns about the imported-vehicle case this product actually serves', () => {
    // The failure mode that matters here: the same car wearing a different
    // badge in a different market, answered with the name seen most often.
    expect(RECOGNITION_SYSTEM_PROMPT).toMatch(/Japanese domestic import/i);
  });

  it('states that an omitted field is a correct answer', () => {
    expect(RECOGNITION_SYSTEM_PROMPT).toMatch(/omitted field is correct and expected/i);
  });

  it('never asks the model to decide anything about the vehicle’s condition', () => {
    // Recognition is identification. Nothing here may drift into diagnosis:
    // no photograph shows whether a car is safe or faulty.
    expect(RECOGNITION_SYSTEM_PROMPT).not.toMatch(/fault|diagnos|damage|safe to drive|condition/i);
  });
});
