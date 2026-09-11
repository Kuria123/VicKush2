import type { ConfirmedDifferential } from '../confirmation';
import type { DiagnosticAnalysis } from '../diagnostics';

import { buildDiagnosticContext } from './context';

/**
 * The AI mechanic: vehicle-specific conversation over a real diagnosis.
 *
 * The behaviour the spec asks for is the whole design. Told "my vehicle is
 * shaking", a mechanic asks when, at what speed, whether it changes with
 * load. It does not answer "your engine mounts have failed", because that is
 * a guess dressed as expertise, and it is the failure mode every symptom
 * checker has.
 *
 * Two mechanisms enforce that here, because instructions alone do not:
 *
 * - The grounding check already rejects part recommendations and invented
 *   readings. It runs on every conversational reply, not just explanations.
 * - The context states plainly what is NOT known — no service history, no
 *   previous repairs, no maintenance records — so the model cannot reason
 *   from a history it has quietly assumed.
 */

export type ConversationRole = 'user' | 'assistant';

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
}

export interface MechanicContextInput {
  vehicleName: string | null;
  /** Null when no scan has been recorded in this session. */
  analysis: DiagnosticAnalysis | null;
  differential: ConfirmedDifferential | null;
  isSimulated: boolean;
}

/**
 * What the mechanic is allowed to know about this vehicle.
 *
 * The spec lists vehicle history, previous repairs and maintenance among the
 * things it should understand. None of those exist yet — persistence is
 * Stage 15 — so rather than omit them silently, the context says they are
 * unavailable. Silence would let the model assume a clean history and reason
 * from it; saying "not recorded" makes the gap part of the answer.
 */
export function buildMechanicContext({
  vehicleName,
  analysis,
  differential,
  isSimulated,
}: MechanicContextInput): string {
  const lines: string[] = [];

  lines.push('# VEHICLE CONTEXT');
  lines.push('');
  lines.push(`Vehicle: ${vehicleName ?? 'not identified'}`);
  if (isSimulated) {
    lines.push(
      'Readings came from a SIMULATED vehicle. Do not present this as a real vehicle.',
    );
  }
  lines.push('');

  lines.push('## WHAT IS NOT AVAILABLE');
  lines.push('You do not have, and must not assume, any of the following:');
  lines.push('- Service history or previous repairs for this vehicle.');
  lines.push('- Maintenance records, service intervals, or when anything was last changed.');
  lines.push('- Mileage, ownership history, or prior diagnostic sessions.');
  lines.push('- Any reading not listed in the diagnostic data below.');
  lines.push(
    'If the answer depends on any of these, ask the owner rather than assuming a value.',
  );
  lines.push('');

  if (analysis && differential) {
    lines.push('## DIAGNOSTIC DATA FROM THE CURRENT SCAN');
    lines.push('');
    lines.push(buildDiagnosticContext({ analysis, differential, vehicleName, isSimulated }));
  } else {
    lines.push('## DIAGNOSTIC DATA');
    lines.push(
      'No scan has been recorded in this session. You have no sensor readings for this vehicle.',
    );
    lines.push(
      'You cannot diagnose anything from description alone. Ask questions, and where a scan would settle the question, say so.',
    );
  }

  return lines.join('\n');
}

export const MECHANIC_SYSTEM_PROMPT = [
  'You are a diagnostic assistant talking to the owner of a specific vehicle.',
  '',
  'Behave like a mechanic taking in a job, not like a symptom checker. A description of a',
  'symptom is the START of a diagnosis, never the end of one.',
  '',
  'When the owner describes a symptom:',
  '',
  '1. Ask the questions that would narrow it. When does it happen — cold or warm, idling or',
  '   moving, under load or coasting? Does it change with engine speed? Is it constant or',
  '   intermittent? Ask two or three, not a list of ten.',
  '2. Explain what each answer would tell you, briefly, so the owner understands why you asked.',
  '3. Where a measurement would settle it, name the measurement.',
  '',
  'You must NOT:',
  '',
  '- Name a component as the cause, or tell anyone to replace, fit or buy a part. Identifying',
  '  which part has failed needs physical inspection that has not happened. This holds even if',
  '  the owner asks you directly for a part.',
  '- State any number that is not in the context or that the owner has not told you. Never',
  '  estimate a reading, a specification, a price or an interval.',
  '- State what a fault code means. No authoritative table is available to you.',
  '- Say whether the vehicle is safe or unsafe to drive, or that something is fixed.',
  '- Assume a service history, a mileage, or when anything was last replaced. You have none.',
  '',
  'If the scan data already answers the question, use it and say which finding it came from.',
  'If you do not have what you need, say exactly what is missing and how it would be obtained.',
  'An honest "I would need to know X" is a better answer than a confident guess.',
  '',
  'Keep replies short — a few sentences, then your questions. Plain language, no jargon',
  'without explaining it.',
].join('\n');

/**
 * The text a reply is checked against.
 *
 * The owner's own words are included deliberately. If they say the shake
 * starts at 2000 rpm, the model must be able to repeat that figure back —
 * it is not a fabrication, it is what it was told. What it still may not do
 * is present it as a measurement, which the prompt covers and the diagnostic
 * context does not contain.
 */
export function groundingCorpus(
  context: string,
  messages: readonly ConversationMessage[],
): string {
  const fromOwner = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n');

  return `${context}\n${fromOwner}`;
}
