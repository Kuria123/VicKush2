/**
 * Cost intelligence.
 *
 * The brief asks for the data model and the service architecture, and then
 * sets the constraint that decides their shape: **never fabricate live market
 * prices.** This build has no parts catalogue, no labour rate table and no
 * market feed, so it has no basis for saying what anything should cost.
 *
 * What it does have is whatever the owner was actually quoted. That is real
 * data, supplied by the person it concerns, and the system can record it,
 * compare quotes with each other, and state the spread. What it cannot do is
 * tell anyone whether a figure is reasonable, and the types make that
 * difference structural rather than a matter of wording:
 *
 * - A `Quote` always carries a real `Money`, because someone was told it.
 * - An `Estimate` is a union that either carries a figure *with its source and
 *   the date it was valid*, or carries the reason it is unknown. It cannot do
 *   both, and it cannot carry a figure with no provenance.
 *
 * Money is held in **minor units as integers**. Floating point is wrong for
 * money — 0.1 + 0.2 is not 0.3 — and a rounding error in a repair quote is the
 * kind of bug that survives to production because it is small enough to look
 * like someone else's mistake.
 */

/** ISO 4217, e.g. "KES", "GBP", "USD". Never assumed. */
export type CurrencyCode = string;

export interface Money {
  /** Integer minor units: cents, pence, or the currency's smallest unit. */
  amountMinor: number;
  currency: CurrencyCode;
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(amountMinor)) {
    // Rule 3: a non-integer here means a caller has done float arithmetic on
    // money somewhere upstream, and silently rounding would hide it.
    throw new Error(`Money must be whole minor units, received ${amountMinor}.`);
  }
  return { amountMinor, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} to ${b.currency}.`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

/**
 * Formats for display.
 *
 * The currency is always shown. A bare number is ambiguous in a product whose
 * users may be quoted in more than one currency, and "1,200" meaning two very
 * different amounts is a mistake worth designing out.
 */
export function formatMoney(value: Money, locale = 'en-GB'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: value.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value.amountMinor / 100);
  } catch {
    // An unrecognised currency code must still render something truthful.
    return `${(value.amountMinor / 100).toFixed(2)} ${value.currency}`;
  }
}

/* -------------------------------------------------------------------------
 * Estimates
 * ---------------------------------------------------------------------- */

export const ESTIMATE_KINDS = ['PARTS', 'LABOUR', 'MARKET'] as const;
export type EstimateKind = (typeof ESTIMATE_KINDS)[number];

/**
 * An estimate this build may or may not be able to make.
 *
 * The known branch requires a source and a date. A price with no provenance is
 * indistinguishable from an invented one, and a price with no date is a claim
 * about today made from data of unknown age.
 */
export type Estimate =
  | {
      known: true;
      kind: EstimateKind;
      value: Money;
      /** Where the figure came from. Never "estimated" or "typical". */
      source: string;
      /** The date the figure was valid, not the date it was displayed. */
      asOf: Date;
    }
  | {
      known: false;
      kind: EstimateKind;
      /** What would be needed to produce one. */
      requires: string;
    };

export function unknownEstimate(kind: EstimateKind, requires: string): Estimate {
  return { known: false, kind, requires };
}

/* -------------------------------------------------------------------------
 * Quotes
 * ---------------------------------------------------------------------- */

export const QUOTE_SOURCES = ['MECHANIC', 'OWNER', 'SUPPLIER'] as const;
export type QuoteSource = (typeof QUOTE_SOURCES)[number];

export const QUOTE_SOURCE_LABELS: Record<QuoteSource, string> = {
  MECHANIC: 'Quoted by a garage',
  OWNER: 'Recorded by the owner',
  SUPPLIER: 'Quoted by a parts supplier',
};

/**
 * A figure someone was actually given.
 *
 * Unlike an estimate, this is never in doubt: the owner was told it. What is
 * in doubt is whether two quotes cover the same work, which is why
 * `description` is required and the comparison says so.
 */
export interface Quote {
  id: string;
  source: QuoteSource;
  /** Who gave it. Free text; this build does not verify the business exists. */
  providedBy: string;
  /** What the quote covers, in the owner's or the garage's words. */
  description: string;
  total: Money;
  /** Optional split, when the quote gave one. Never inferred. */
  partsPortion: Money | null;
  labourPortion: Money | null;
  receivedAt: Date;
  notes: string | null;
}

/* -------------------------------------------------------------------------
 * Comparison
 * ---------------------------------------------------------------------- */

export interface QuoteObservation {
  /** A statement of fact about the numbers. Never a judgement of them. */
  statement: string;
}

export interface QuoteComparison {
  quotes: readonly Quote[];
  /** Null when there are fewer than two comparable quotes. */
  lowest: Quote | null;
  highest: Quote | null;
  /** Highest minus lowest, when both exist in the same currency. */
  spread: Money | null;
  observations: readonly QuoteObservation[];
  /**
   * Always populated. The first is always that this build cannot say what the
   * work should cost.
   */
  limitations: readonly [string, ...string[]];
}
