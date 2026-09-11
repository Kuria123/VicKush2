import type { ConfirmedDifferential } from '../confirmation';
import { OUTCOME_LABELS, type TestResult } from '../confirmation';
import type { DiagnosticAnalysis } from '../diagnostics';
import { SEVERITY_LABELS, SYSTEM_LABELS } from '../diagnostics';

/**
 * Serialises a finished diagnosis into the closed context the AI may reason
 * over.
 *
 * "Closed" is the whole idea. The model is given the measurements, the
 * findings, the ranked causes with their evidence, and the stated limits —
 * and nothing else. It has no tools, no retrieval and no access to the
 * vehicle. Anything it says that is not derivable from this text is, by
 * construction, invented.
 *
 * That is what makes the grounding check in `grounding.ts` possible at all:
 * the set of numbers the model is permitted to state is exactly the set of
 * numbers in here, and both sides read from this same builder.
 *
 * Two things are deliberately excluded:
 *
 * - **Any meaning for a fault code.** The codes appear with their structure
 *   only, because this build has no authoritative table and inviting the
 *   model to supply one would launder a guess into the diagnosis (Rule 1).
 * - **The scenario name.** A simulated session knows which fault was
 *   injected. Telling the model would let it name the answer without
 *   reasoning from the evidence, which would make every explanation look
 *   excellent and mean nothing.
 */

export interface DiagnosticContextInput {
  analysis: DiagnosticAnalysis;
  differential: ConfirmedDifferential;
  /** Shown so the explanation can address the vehicle, not "the vehicle". */
  vehicleName?: string | null;
  isSimulated: boolean;
}

export function buildDiagnosticContext({
  analysis,
  differential,
  vehicleName = null,
  isSimulated,
}: DiagnosticContextInput): string {
  const lines: string[] = [];

  lines.push('# DIAGNOSTIC CONTEXT');
  lines.push('');
  lines.push(
    'Everything below was produced by a deterministic diagnostic engine from recorded sensor readings.',
  );
  if (isSimulated) {
    lines.push(
      'This session came from a SIMULATED vehicle. Say so in your summary; do not present it as a real vehicle.',
    );
  }
  lines.push('');

  /* --- Session ---------------------------------------------------------- */
  lines.push('## SESSION');
  if (vehicleName) lines.push(`Vehicle: ${vehicleName}`);
  lines.push(`Samples recorded: ${analysis.sampleCount}`);
  lines.push(
    `Operating conditions observed: ${analysis.conditionsObserved.join(', ') || 'none'}`,
  );
  lines.push('');

  /* --- Findings --------------------------------------------------------- */
  lines.push('## FINDINGS (what the engine observed)');
  if (analysis.findings.length === 0) {
    lines.push('None.');
  }
  for (const finding of analysis.findings) {
    lines.push(
      `- [${SEVERITY_LABELS[finding.severity]}] [${SYSTEM_LABELS[finding.system]}] ${finding.title}`,
    );
    for (const item of finding.supporting) {
      lines.push(`    supporting: ${item.summary}`);
    }
    for (const item of finding.opposing) {
      lines.push(`    opposing:   ${item.summary}`);
    }
  }
  lines.push('');

  /* --- Verdict and causes ----------------------------------------------- */
  lines.push('## CANDIDATE CAUSES');
  lines.push(`Verdict: ${differential.verdict}`);
  if (differential.verdict === 'AMBIGUOUS') {
    lines.push(
      'The evidence does NOT separate the leading causes. You must not pick one. Say plainly that more than one explanation fits.',
    );
  }
  lines.push('');

  for (const cause of differential.causes) {
    lines.push(`### ${cause.label}`);
    lines.push(`status: ${cause.status}; evidence fit: ${cause.confidence}%`);
    lines.push(`mechanism: ${cause.mechanism}`);
    for (const item of cause.contributions) {
      lines.push(`  + (${item.points}) ${item.observation}`);
      lines.push(`      because: ${item.reason}`);
    }
    for (const reason of cause.unmet) {
      lines.push(`  ? expected but not observed: ${reason}`);
    }
    lines.push('');
  }

  if (differential.ruledOut.length > 0) {
    lines.push('## CAUSES RULED OUT');
    for (const cause of differential.ruledOut) {
      lines.push(`### ${cause.label}`);
      for (const item of cause.exclusions) {
        lines.push(`  - excluded by: ${item.observation}`);
        lines.push(`      because: ${item.reason}`);
      }
      lines.push('');
    }
  }

  /* --- Tests ------------------------------------------------------------ */
  lines.push('## CONFIRMATION TESTS');
  if (differential.results.length > 0) {
    lines.push('Performed:');
    for (const result of differential.results) {
      lines.push(`- ${describeResult(result)}`);
    }
  }
  if (differential.recommended.length > 0) {
    lines.push('Recommended next:');
    for (const offer of differential.recommended) {
      lines.push(`- ${offer.test.title}: ${offer.test.question}`);
    }
  }
  if (differential.results.length === 0 && differential.recommended.length === 0) {
    lines.push('None.');
  }
  lines.push('');

  /* --- Limits ----------------------------------------------------------- */
  lines.push('## LIMITS OF THIS DIAGNOSIS');
  for (const limitation of differential.limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push('');

  /* --- Fault codes, structure only -------------------------------------- */
  const codes = analysis.evidence.filter((e) => e.kind === 'DTC');
  if (codes.length > 0) {
    lines.push('## FAULT CODES PRESENT');
    lines.push(
      'Reported for completeness. This build has NO authoritative table of code meanings.',
    );
    lines.push(
      'You must NOT state what any code means. Refer to a code only by its identifier.',
    );
    for (const code of codes) {
      lines.push(`- ${code.summary}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function describeResult(result: TestResult): string {
  const outcome = OUTCOME_LABELS[result.outcome];
  return result.note
    ? `${result.testId}: ${outcome} — ${result.note}`
    : `${result.testId}: ${outcome}`;
}

/**
 * The instruction given alongside the context.
 *
 * Kept beside the builder on purpose: the rules the model is told to follow
 * and the rules the grounding check enforces have to stay in step, and
 * splitting them across files is how they drift apart.
 */
export const EXPLANATION_SYSTEM_PROMPT = [
  'You explain vehicle diagnostics to the person who owns the vehicle.',
  '',
  'A deterministic diagnostic engine has already done the reasoning. Your job is to make its',
  'conclusions understandable — not to reach your own.',
  '',
  'Rules, all of which are checked automatically before your answer is shown:',
  '',
  '1. Use ONLY the numbers that appear in the context. Never estimate, round to a new figure,',
  '   convert units, or introduce a measurement of your own. If a number is not in the context,',
  '   you do not know it.',
  '2. Never state what a fault code means. The context deliberately omits code meanings because',
  '   no authoritative table is available. Refer to codes by identifier only.',
  '3. Never name a part to replace, fit or buy. The engine identifies mechanisms, not components,',
  '   and deciding which part has failed needs physical inspection that has not happened.',
  '4. If the verdict is AMBIGUOUS, do not pick a leading cause. Say that more than one',
  '   explanation fits and that the recommended test is what would separate them.',
  '5. Do not claim the vehicle is safe, unsafe, repaired, or fine. You are explaining a scan.',
  '6. If the context does not support an answer, say so. An honest gap is the correct output.',
  '',
  'Respond as JSON only, with exactly these keys:',
  '{"summary": string, "reasoning": string, "caveats": string[]}',
  '',
  'summary: two or three sentences a non-specialist can follow.',
  'reasoning: why the evidence points where it does, in plain language.',
  'caveats: the limits that matter, drawn from the context.',
].join('\n');
