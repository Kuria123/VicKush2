import { describe, expect, it } from 'vitest';

import { compareQuotes } from './engine';
import { addMoney, formatMoney, money, unknownEstimate, type Quote } from './types';

/**
 * Cost intelligence.
 *
 * The brief's constraint is a single sentence — never fabricate live market
 * prices — and most of these tests are about the consequences of taking it
 * seriously: what the system will state, and what it refuses to.
 */

const KES = (major: number): Quote['total'] => money(major * 100, 'KES');

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'q1',
    source: 'MECHANIC',
    providedBy: 'Garage A',
    description: 'Replace intake hose',
    total: KES(8000),
    partsPortion: null,
    labourPortion: null,
    receivedAt: new Date('2026-03-01T10:00:00Z'),
    notes: null,
    ...overrides,
  };
}

/* ---------------------------------------------------------------------------
 * Money
 * ------------------------------------------------------------------------ */

describe('money', () => {
  it('refuses a fractional minor unit rather than rounding it away', () => {
    // A non-integer means float arithmetic happened upstream. Rounding here
    // would hide the bug instead of surfacing it.
    expect(() => money(1234.5, 'KES')).toThrow(/whole minor units/i);
  });

  it('refuses to add across currencies', () => {
    expect(() => addMoney(money(100, 'KES'), money(100, 'GBP'))).toThrow(/Cannot add/);
  });

  it('is exact where floating point is not', () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in minor units it simply is.
    const total = addMoney(money(10, 'KES'), money(20, 'KES'));
    expect(total.amountMinor).toBe(30);
  });

  it('always shows the currency', () => {
    // "1,200" meaning two very different amounts is a mistake worth designing
    // out of a product whose users may be quoted in more than one currency.
    expect(formatMoney(money(120_000, 'KES'))).toMatch(/KES|Ksh/);
    expect(formatMoney(money(120_000, 'GBP'))).toMatch(/£|GBP/);
  });

  it('renders an unrecognised currency truthfully rather than throwing', () => {
    // Intl accepts any well-formed code, so ZZZ formats rather than failing.
    // What matters is the property, not the arrangement: the amount is right
    // and the currency is never dropped.
    const formatted = formatMoney({ amountMinor: 5000, currency: 'ZZZ' });
    expect(formatted).toContain('ZZZ');
    expect(formatted).toMatch(/50/);

    // A malformed code does throw, and the fallback still says both.
    const fallback = formatMoney({ amountMinor: 5000, currency: 'Z' });
    expect(fallback).toBe('50.00 Z');
  });
});

/* ---------------------------------------------------------------------------
 * Estimates
 * ------------------------------------------------------------------------ */

describe('estimates', () => {
  it('cannot carry a figure without provenance', () => {
    const estimate = unknownEstimate('MARKET', 'A live market feed for your area.');

    expect(estimate.known).toBe(false);
    // The type makes the alternative unconstructable: there is no branch that
    // holds a value without a source and a date.
    expect('value' in estimate).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Comparison
 * ------------------------------------------------------------------------ */

describe('comparing quotes', () => {
  it('always says it cannot judge what the work should cost', () => {
    for (const quotes of [
      [],
      [quote()],
      [quote(), quote({ id: 'q2', total: KES(14_000) })],
    ]) {
      expect(compareQuotes(quotes).limitations[0]).toMatch(/cannot say what the work should cost/i);
    }
  });

  it('states the spread as a fact, not a judgement', () => {
    const result = compareQuotes([
      quote({ id: 'q1', providedBy: 'Garage A', total: KES(8000) }),
      quote({ id: 'q2', providedBy: 'Garage B', total: KES(14_000) }),
    ]);

    const said = result.observations.map((o) => o.statement).join(' ');
    expect(said).toMatch(/2 quotes recorded/);
    expect(said).toMatch(/spread between them/i);
    expect(said).toMatch(/1\.8 times the lowest/);

    // Never a verdict on either figure.
    expect(said).not.toMatch(/\b(too much|expensive|cheap|overpriced|fair|reasonable|good value)\b/i);
  });

  it('identifies lowest and highest without recommending either', () => {
    const result = compareQuotes([
      quote({ id: 'q1', providedBy: 'Garage A', total: KES(8000) }),
      quote({ id: 'q2', providedBy: 'Garage B', total: KES(14_000) }),
    ]);

    expect(result.lowest?.providedBy).toBe('Garage A');
    expect(result.highest?.providedBy).toBe('Garage B');
    expect(result.spread?.amountMinor).toBe(600_000);

    const everything = [...result.observations.map((o) => o.statement), ...result.limitations].join(' ');
    expect(everything).not.toMatch(/\b(choose|pick|go with|recommend)\b/i);
  });

  it('warns that the quotes may not cover the same work', () => {
    const result = compareQuotes([quote(), quote({ id: 'q2', total: KES(14_000) })]);

    // A lower quote may simply exclude part of the job, and this build has no
    // way to establish that.
    expect(result.limitations.join(' ')).toMatch(/whether they cover the same work/i);
  });

  it('refuses to compare across currencies rather than converting', () => {
    const result = compareQuotes([
      quote({ id: 'q1', total: money(800_000, 'KES') }),
      quote({ id: 'q2', total: money(6000, 'GBP') }),
    ]);

    // Applying an exchange rate this build does not have, on a date it does
    // not know, is a real error dressed as a convenience.
    expect(result.spread).toBeNull();
    expect(result.lowest).toBeNull();
    expect(result.limitations.join(' ')).toMatch(/different currencies/i);
    expect(result.limitations.join(' ')).toMatch(/exchange rate this build does not have/i);
  });

  it('says a single quote has nothing to compare against', () => {
    const result = compareQuotes([quote()]);

    expect(result.spread).toBeNull();
    expect(result.limitations.join(' ')).toMatch(/nothing to be compared against/i);
  });

  it('does not divide by zero on a free quote', () => {
    const result = compareQuotes([
      quote({ id: 'q1', total: KES(0) }),
      quote({ id: 'q2', total: KES(5000) }),
    ]);

    expect(result.observations.map((o) => o.statement).join(' ')).not.toMatch(/Infinity|NaN/);
  });

  it('notes when only some quotes break down parts and labour', () => {
    const result = compareQuotes([
      quote({ id: 'q1', partsPortion: KES(3000), labourPortion: KES(5000) }),
      quote({ id: 'q2', total: KES(14_000) }),
    ]);

    expect(result.observations.map((o) => o.statement).join(' ')).toMatch(
      /1 of 2 quotes separate parts from labour/,
    );
  });

  it('handles identical quotes without implying a difference', () => {
    const result = compareQuotes([quote({ id: 'q1' }), quote({ id: 'q2' })]);
    expect(result.observations.map((o) => o.statement).join(' ')).toMatch(
      /Every quote is for the same amount/,
    );
  });

  it('orders quotes lowest first so the comparison reads consistently', () => {
    const result = compareQuotes([
      quote({ id: 'high', total: KES(14_000) }),
      quote({ id: 'low', total: KES(8000) }),
    ]);

    expect(result.quotes.map((q) => q.id)).toEqual(['low', 'high']);
  });
});
