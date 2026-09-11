import { describe, expect, it } from 'vitest';

import {
  buildMechanicContext,
  groundingCorpus,
  MECHANIC_SYSTEM_PROMPT,
  type ConversationMessage,
} from './conversation';
import { checkGrounding } from './grounding';

/**
 * The mechanic's context and the rules it works under.
 *
 * The behaviour the spec asks for — ask questions rather than name a failed
 * component — is enforced in two places, and both are tested here: the
 * instruction that tells the model to, and the grounding check that rejects
 * the reply if it does not.
 */

const EMPTY = buildMechanicContext({
  vehicleName: 'Toyota Harrier',
  analysis: null,
  differential: null,
  isSimulated: true,
});

describe('mechanic context', () => {
  it('names the vehicle it is talking about', () => {
    expect(EMPTY).toContain('Toyota Harrier');
  });

  it('states the history it does not have, rather than omitting it', () => {
    // Silence would let the model assume a clean history and reason from it.
    expect(EMPTY).toContain('Service history or previous repairs');
    expect(EMPTY).toContain('Maintenance records');
    expect(EMPTY).toContain('Mileage');
    expect(EMPTY).toMatch(/ask the owner rather than assuming/i);
  });

  it('says plainly when there are no readings at all', () => {
    expect(EMPTY).toMatch(/No scan has been recorded/);
    expect(EMPTY).toMatch(/cannot diagnose anything from description alone/i);
  });

  it('discloses a simulated source', () => {
    expect(EMPTY).toContain('SIMULATED');
  });
});

describe('mechanic instructions', () => {
  it('requires questions before conclusions', () => {
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/START of a diagnosis, never the end/i);
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/Ask the questions that would narrow it/i);
  });

  it('forbids naming a part even when asked directly', () => {
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/Name a component as the cause/);
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/even if\s+the owner asks you directly for a part/i);
  });

  it('forbids inventing numbers, code meanings and safety claims', () => {
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/State any number that is not in the context/);
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/State what a fault code means/);
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/safe or unsafe to drive/);
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/Assume a service history/);
  });

  it('prefers an admitted gap to a guess', () => {
    expect(MECHANIC_SYSTEM_PROMPT).toMatch(/better answer than a confident guess/i);
  });
});

describe('grounding a conversation', () => {
  const messages: ConversationMessage[] = [
    { role: 'user', content: 'It shakes when I stop at lights, worse at about 700 rpm.' },
  ];
  const corpus = groundingCorpus(EMPTY, messages);

  it('lets the mechanic repeat a figure the owner supplied', () => {
    // Not a fabrication — it is what it was told.
    const report = checkGrounding(
      'You mentioned it is worse around 700 rpm, which is idle. Does it change if you switch the air conditioning on?',
      corpus,
    );
    expect(report.grounded).toBe(true);
  });

  it('still rejects a figure nobody supplied', () => {
    const report = checkGrounding(
      'A healthy engine holds idle within 45 rpm, so yours is outside that.',
      corpus,
    );
    expect(report.grounded).toBe(false);
  });

  it('rejects naming a part to fit', () => {
    const report = checkGrounding(
      'That sounds like worn engine mounts. You should replace the mounts.',
      corpus,
    );
    expect(report.violations.some((v) => v.kind === 'PART_RECOMMENDATION')).toBe(true);
  });

  it('rejects a claim about whether it can be driven', () => {
    const report = checkGrounding('It is safe to drive for now.', corpus);
    expect(report.violations.some((v) => v.kind === 'SAFETY_CLAIM')).toBe(true);
  });

  it('does not treat the mechanic\'s own earlier replies as ground truth', () => {
    // Only the owner's messages join the corpus. Otherwise the model could
    // invent a figure once and cite itself from then on.
    const withReply = groundingCorpus(EMPTY, [
      ...messages,
      { role: 'assistant', content: 'Idle should sit near 812 rpm.' },
    ]);
    expect(checkGrounding('As I said, idle should be 812 rpm.', withReply).grounded).toBe(false);
  });
});
