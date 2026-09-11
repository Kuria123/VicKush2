/**
 * Checks an AI explanation back against the context it was given.
 *
 * This is the file that makes "the AI is not the source of truth" an
 * enforced property rather than an intention. A language model asked to
 * explain a diagnosis will, sooner or later, produce a number that was never
 * measured, a meaning for a fault code it cannot know, or a part to replace —
 * not because it is badly prompted, but because fluent prose has a pull
 * towards completeness. Prompting reduces that. It does not remove it.
 *
 * So the output is verified. Anything the check objects to is withheld from
 * the user entirely: a fabricated reading delivered in confident prose is
 * worse than no explanation, because it is indistinguishable from a real one.
 *
 * The check is deliberately conservative in one direction only. It may reject
 * an explanation that was in fact fine (a number written as a word, an
 * unusual phrasing). It must never pass one that invented a measurement.
 */

export interface GroundingViolation {
  kind: 'UNGROUNDED_NUMBER' | 'CODE_MEANING' | 'PART_RECOMMENDATION' | 'SAFETY_CLAIM';
  detail: string;
}

export interface GroundingReport {
  grounded: boolean;
  violations: readonly GroundingViolation[];
}

/**
 * Numbers the model may always use, because they are not measurements.
 *
 * Small integers appear in ordinary prose — "one of two causes", "the first
 * test" — and rejecting those would make the check unusable while catching
 * nothing. A fabricated sensor reading is not 1, 2 or 3.
 */
const FREE_NUMBERS = new Set([0, 1, 2, 3, 4]);

/** Phrases that assert a meaning for a fault code. */
const CODE_MEANING_PATTERNS: readonly RegExp[] = [
  // "P0171 means…", "P0171 indicates…", "P0171 is a lean code"
  /\bP[0-9][0-9A-F]{3}\b\s+(?:means|indicates|signifies|stands for|is\s+(?:a|an|the))/i,
  /\bcode\s+P[0-9][0-9A-F]{3}\b[^.]*\b(?:means|indicates|signifies)\b/i,
  // "which means the system is too lean"
  /\b(?:system|bank)\s+(?:too\s+)?lean\b\s*\(/i,
];

/** Phrases that recommend fitting a component. */
const PART_PATTERNS: readonly RegExp[] = [
  /\b(?:replace|replacing|renew|install|fit|fitting|swap|change out|buy|order)\s+(?:the|a|an|your|its|new)\b/i,
  /\byou\s+(?:should|need to|must|will need to)\s+(?:replace|install|fit|buy|order)\b/i,
  /\bnew\s+(?:sensor|injector|pump|gasket|hose|thermostat|alternator|battery|plug|coil|radiator)\b/i,
];

/** Claims about roadworthiness the scan cannot support. */
const SAFETY_PATTERNS: readonly RegExp[] = [
  /\b(?:safe|unsafe|dangerous)\s+to\s+drive\b/i,
  /\b(?:is|are)\s+now\s+(?:fixed|repaired|resolved)\b/i,
  /\byour\s+(?:vehicle|car)\s+is\s+(?:fine|healthy|in good health|perfectly fine)\b/i,
];

export function checkGrounding(text: string, context: string): GroundingReport {
  const violations: GroundingViolation[] = [];

  for (const number of ungroundedNumbers(text, context)) {
    violations.push({
      kind: 'UNGROUNDED_NUMBER',
      detail: `The explanation states "${number}", which does not appear in the diagnostic context.`,
    });
  }

  for (const pattern of CODE_MEANING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        kind: 'CODE_MEANING',
        detail: `The explanation asserts what a fault code means ("${match[0].trim()}"), which this build cannot verify.`,
      });
      break;
    }
  }

  for (const pattern of PART_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        kind: 'PART_RECOMMENDATION',
        detail: `The explanation recommends fitting a component ("${match[0].trim()}"), which a scan cannot justify.`,
      });
      break;
    }
  }

  for (const pattern of SAFETY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        kind: 'SAFETY_CLAIM',
        detail: `The explanation makes a claim about the vehicle's condition ("${match[0].trim()}") that a scan cannot support.`,
      });
      break;
    }
  }

  return { grounded: violations.length === 0, violations };
}

/**
 * Numbers stated in the explanation that are absent from the context.
 *
 * Matching is on the numeric value rather than the exact string, so "22.8"
 * and "22.80" are the same figure and a legitimate reformatting is not
 * treated as an invention. Percentages, temperatures and pressures all fall
 * out of the same comparison.
 */
function ungroundedNumbers(text: string, context: string): string[] {
  const contextNumbers = new Set(
    [...context.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])),
  );

  // Also admit the integer part of any context figure: "380 kPa" may
  // reasonably be discussed as "380", and "22.8%" as "22".
  for (const value of [...contextNumbers]) {
    contextNumbers.add(Math.trunc(value));
    contextNumbers.add(Math.round(value));
  }

  const offending: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const raw = match[0];
    const value = Number(raw);

    if (FREE_NUMBERS.has(Math.abs(value))) continue;
    if (contextNumbers.has(value)) continue;
    if (seen.has(raw)) continue;

    seen.add(raw);
    offending.push(raw);
  }

  return offending;
}

/**
 * Parses a model's JSON reply.
 *
 * Returns null rather than throwing or salvaging: a reply that is not the
 * shape asked for is a failed call, and guessing at its intent is exactly the
 * kind of helpfulness that lets malformed output reach a user.
 */
export function parseExplanationJson(
  raw: string,
): { summary: string; reasoning: string; caveats: string[] } | null {
  // Models commonly wrap JSON in a fenced block; that much is worth handling.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  const summary = record.summary;
  const reasoning = record.reasoning;
  const caveats = record.caveats;

  if (typeof summary !== 'string' || summary.trim().length === 0) return null;
  if (typeof reasoning !== 'string' || reasoning.trim().length === 0) return null;
  if (!Array.isArray(caveats) || !caveats.every((c) => typeof c === 'string')) return null;

  return { summary, reasoning, caveats };
}
