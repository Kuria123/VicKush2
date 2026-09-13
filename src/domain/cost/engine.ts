import {
  formatMoney,
  type Money,
  type Quote,
  type QuoteComparison,
  type QuoteObservation,
} from './types';

/**
 * Comparing quotes with each other.
 *
 * Every statement this produces is a fact about the numbers supplied: which is
 * highest, which is lowest, how far apart they are. None of them is a
 * judgement, because a judgement needs a reference price and this build has
 * none.
 *
 * "You were quoted 8,000 and 14,000" is useful and true. "14,000 is too much"
 * requires knowing what the work is worth, and nothing here does. The
 * distinction is the whole design — a product that guesses at the second would
 * be more satisfying to use and considerably more likely to cost someone money.
 */

const CANNOT_PRICE =
  'This build cannot say what the work should cost. It has no parts catalogue, no labour rates and no market data, so it can compare the quotes you have entered but not judge any of them.';

const SAME_WORK_UNKNOWN =
  'These quotes are compared as figures. Whether they cover the same work is not something this build can establish — a lower quote may exclude parts, labour, or part of the job.';

export function compareQuotes(quotes: readonly Quote[]): QuoteComparison {
  if (quotes.length === 0) {
    return {
      quotes: [],
      lowest: null,
      highest: null,
      spread: null,
      observations: [],
      limitations: [CANNOT_PRICE],
    };
  }

  if (quotes.length === 1) {
    const only = quotes[0]!;
    return {
      quotes,
      lowest: null,
      highest: null,
      spread: null,
      observations: [
        {
          statement: `One quote recorded: ${formatMoney(only.total)} from ${only.providedBy}.`,
        },
      ],
      limitations: [
        CANNOT_PRICE,
        'A single quote has nothing to be compared against. Recording a second gives this something to work with.',
      ],
    };
  }

  /*
   * Quotes in different currencies are not compared.
   *
   * Converting them would need an exchange rate this build does not have, and
   * a rate applied on the wrong date is a real error dressed as a convenience.
   */
  const currencies = [...new Set(quotes.map((quote) => quote.total.currency))];
  if (currencies.length > 1) {
    return {
      quotes,
      lowest: null,
      highest: null,
      spread: null,
      observations: quotes.map((quote) => ({
        statement: `${formatMoney(quote.total)} from ${quote.providedBy}.`,
      })),
      limitations: [
        CANNOT_PRICE,
        `These quotes are in different currencies (${currencies.join(', ')}). Comparing them would need an exchange rate this build does not have, and applying the wrong one is a real error dressed as a convenience.`,
        SAME_WORK_UNKNOWN,
      ],
    };
  }

  const sorted = [...quotes].sort((a, b) => a.total.amountMinor - b.total.amountMinor);
  const lowest = sorted[0]!;
  const highest = sorted[sorted.length - 1]!;

  const spread: Money = {
    amountMinor: highest.total.amountMinor - lowest.total.amountMinor,
    currency: lowest.total.currency,
  };

  const observations: QuoteObservation[] = [
    {
      statement: `${quotes.length} quotes recorded, from ${formatMoney(lowest.total)} to ${formatMoney(highest.total)}.`,
    },
    {
      statement:
        spread.amountMinor === 0
          ? 'Every quote is for the same amount.'
          : `The spread between them is ${formatMoney(spread)}.`,
    },
  ];

  // A multiple is a fact about two numbers; it is not a claim that either is
  // wrong. Only stated when the lower is non-zero, since dividing by zero
  // would produce a figure that means nothing.
  if (lowest.total.amountMinor > 0 && spread.amountMinor > 0) {
    const multiple = highest.total.amountMinor / lowest.total.amountMinor;
    observations.push({
      statement: `The highest is ${multiple.toFixed(1)} times the lowest.`,
    });
  }

  const withBreakdown = quotes.filter(
    (quote) => quote.partsPortion !== null || quote.labourPortion !== null,
  );
  if (withBreakdown.length > 0 && withBreakdown.length < quotes.length) {
    observations.push({
      statement: `${withBreakdown.length} of ${quotes.length} quotes separate parts from labour; the others give a total only.`,
    });
  }

  return {
    quotes: sorted,
    lowest,
    highest,
    spread,
    observations,
    limitations: [CANNOT_PRICE, SAME_WORK_UNKNOWN],
  };
}
