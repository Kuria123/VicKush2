import { describe, expect, it } from 'vitest';

import { verifyRepair } from './engine';
import type { RepairEvent, ScanFinding, ScanSnapshot } from './types';

/**
 * Repair verification.
 *
 * The brief asks for a cautious conclusion. These tests are mostly about what
 * the engine refuses to conclude: that a cleared code means anything, that an
 * improvement means "fixed", or that two scans taken under different
 * conditions can be compared at all.
 */

const BEFORE_AT = new Date('2026-03-01T09:00:00Z');
const AFTER_AT = new Date('2026-03-02T14:00:00Z');

const LEAN: ScanFinding = {
  findingId: 'lean-condition',
  title: 'Lean condition detected',
  system: 'FUEL',
  severity: 'SIGNIFICANT',
};

const REPAIR: RepairEvent = {
  id: 'r1',
  performedAt: new Date('2026-03-02T10:00:00Z'),
  summary: 'Intake hose replaced',
  notes: null,
  guideId: 'locate-unmetered-air',
  causeId: 'unmetered-air',
};

function snapshot(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    sessionId: 's',
    at: BEFORE_AT,
    isSimulated: false,
    conditionsObserved: ['IDLE', 'LIGHT_LOAD'],
    parameters: [],
    dtcCodes: [],
    findings: [],
    healthScore: null,
    ...overrides,
  };
}

/** The brief's own example: STFT +19/LTFT +16 before, +5/+4 after. */
function trims(short: number, long: number, condition = 'IDLE') {
  return [
    { parameterId: 'SHORT_FUEL_TRIM_1', condition, mean: short, samples: 200, unit: '%' },
    { parameterId: 'LONG_FUEL_TRIM_1', condition, mean: long, samples: 200, unit: '%' },
  ];
}

/* ---------------------------------------------------------------------------
 * The brief's example
 * ------------------------------------------------------------------------ */

describe('the worked example', () => {
  const result = verifyRepair({
    before: snapshot({ parameters: trims(19, 16), findings: [LEAN] }),
    after: snapshot({ at: AFTER_AT, parameters: trims(5, 4) }),
    repair: REPAIR,
  });

  it('reaches the positive verdict', () => {
    expect(result.verdict).toBe('CONSISTENT_WITH_REPAIR');
  });

  it('says consistent with, never fixed', () => {
    // There is deliberately no FIXED verdict. Nothing in a scan can establish
    // that a fault will not return.
    expect(result.summary).toMatch(/consistent with the repair having worked/i);
    expect(result.summary).toMatch(/not proof/i);
    expect(result.summary).not.toMatch(/\bfixed\b|\brepaired\b|\bsolved\b/i);
  });

  it('shows the movement it reasoned from', () => {
    expect(result.reasoning.join(' ')).toMatch(/Short term fuel trim at idle moved from \+19/);
    expect(result.reasoning.join(' ')).toMatch(/Long term fuel trim at idle moved from \+16/);
  });

  it('records the finding as resolved', () => {
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.status).toBe('RESOLVED');
  });

  it('attaches caveats even to a positive result', () => {
    // A conclusion the reader is most likely to act on is the one that most
    // needs its limits stated.
    expect(result.caveats.length).toBeGreaterThan(1);
    expect(result.caveats.join(' ')).toMatch(/intermittent fault/i);
    expect(result.caveats.join(' ')).toMatch(/learned slowly/i);
  });
});

/* ---------------------------------------------------------------------------
 * What it refuses to conclude
 * ------------------------------------------------------------------------ */

describe('cleared fault codes', () => {
  const result = verifyRepair({
    before: snapshot({ parameters: trims(19, 16), dtcCodes: ['P0171'], findings: [LEAN] }),
    // Codes gone, but the trims did not move at all.
    after: snapshot({ at: AFTER_AT, parameters: trims(19, 16), dtcCodes: [] }),
    repair: REPAIR,
  });

  it('does not treat a cleared code as evidence of repair', () => {
    // Codes clear on command. Absence proves nothing on its own.
    expect(result.verdict).toBe('NOT_DEMONSTRATED');
  });

  it('reports the code as cleared and says why that carries no weight', () => {
    expect(result.dtcs).toEqual([{ code: 'P0171', status: 'CLEARED' }]);
    expect(result.caveats.join(' ')).toMatch(/clear on command/i);
    expect(result.caveats.join(' ')).toMatch(/was not used to reach this conclusion/i);
  });
});

describe('mismatched conditions', () => {
  it('refuses to compare when the after scan did not revisit the conditions', () => {
    const result = verifyRepair({
      before: snapshot({ conditionsObserved: ['LIGHT_LOAD'], parameters: trims(19, 16, 'LIGHT_LOAD') }),
      after: snapshot({
        at: AFTER_AT,
        conditionsObserved: ['IDLE'],
        parameters: trims(4, 3, 'IDLE'),
      }),
      repair: REPAIR,
    });

    // The numbers look much better, and it still refuses: comparing idle
    // against load answers a different question from the one being asked.
    expect(result.verdict).toBe('INCONCLUSIVE');
    expect(result.summary).toMatch(/cannot be compared/i);
  });

  it('never pairs a reading with one from a different condition', () => {
    const result = verifyRepair({
      before: snapshot({
        conditionsObserved: ['IDLE', 'LIGHT_LOAD'],
        parameters: [...trims(19, 16, 'IDLE'), ...trims(6, 5, 'LIGHT_LOAD')],
      }),
      after: snapshot({
        at: AFTER_AT,
        conditionsObserved: ['IDLE'],
        parameters: trims(5, 4, 'IDLE'),
      }),
      repair: REPAIR,
    });

    // Only the idle pair exists on both sides, so only it is compared.
    expect(result.parameters.every((p) => p.condition === 'IDLE')).toBe(true);
    expect(result.caveats.join(' ')).toMatch(/did not revisit light load/i);
  });
});

describe('when nothing changed', () => {
  it('says so without implying the work was done badly', () => {
    const result = verifyRepair({
      before: snapshot({ parameters: trims(19, 16), findings: [LEAN] }),
      after: snapshot({ at: AFTER_AT, parameters: trims(18, 16), findings: [LEAN] }),
      repair: REPAIR,
    });

    expect(result.verdict).toBe('NOT_DEMONSTRATED');
    expect(result.summary).toMatch(/not the same as the work having been done badly/i);
  });

  it('treats movement inside the noise floor as unchanged', () => {
    const result = verifyRepair({
      before: snapshot({ parameters: trims(19, 16) }),
      after: snapshot({ at: AFTER_AT, parameters: trims(17, 15) }),
      repair: REPAIR,
    });

    expect(result.parameters.every((p) => !p.significant)).toBe(true);
    expect(result.verdict).toBe('NOT_DEMONSTRATED');
  });

  it('reports an insignificant change rather than hiding it', () => {
    const result = verifyRepair({
      before: snapshot({ parameters: trims(19, 16) }),
      after: snapshot({ at: AFTER_AT, parameters: trims(17, 15) }),
      repair: REPAIR,
    });

    // The reader is entitled to see that a number barely moved.
    expect(result.parameters).toHaveLength(2);
    expect(result.parameters[0]?.direction).toBe('UNCHANGED');
  });
});

describe('when something got worse', () => {
  it('outranks improvement elsewhere', () => {
    const result = verifyRepair({
      before: snapshot({
        parameters: [
          ...trims(19, 16),
          { parameterId: 'COOLANT_TEMP', condition: 'IDLE', mean: 92, samples: 200, unit: '°C' },
        ],
      }),
      after: snapshot({
        at: AFTER_AT,
        parameters: [
          ...trims(4, 3),
          // Running much hotter than before.
          { parameterId: 'COOLANT_TEMP', condition: 'IDLE', mean: 112, samples: 200, unit: '°C' },
        ],
      }),
      repair: REPAIR,
    });

    // A repair that fixed one thing and broke another has not succeeded.
    expect(result.verdict).toBe('WORSENED');
    expect(result.summary).toMatch(/measurably worse/i);
  });

  it('treats a finding that was not there before as worse', () => {
    const overheating: ScanFinding = {
      findingId: 'overheating',
      title: 'Engine running above safe temperature',
      system: 'COOLING',
      severity: 'SEVERE',
    };

    const result = verifyRepair({
      before: snapshot({ parameters: trims(19, 16), findings: [LEAN] }),
      after: snapshot({ at: AFTER_AT, parameters: trims(4, 3), findings: [overheating] }),
      repair: REPAIR,
    });

    expect(result.verdict).toBe('WORSENED');
    expect(result.findings.find((f) => f.status === 'NEW')?.finding.findingId).toBe('overheating');
  });
});

describe('a finding that survived the work', () => {
  it('outranks an improvement in the numbers', () => {
    const result = verifyRepair({
      before: snapshot({ parameters: trims(19, 16), findings: [LEAN] }),
      after: snapshot({ at: AFTER_AT, parameters: trims(4, 3), findings: [LEAN] }),
      repair: REPAIR,
    });

    // Whatever the numbers did, the engine still says the condition is present.
    expect(result.verdict).toBe('NOT_DEMONSTRATED');
    expect(result.reasoning.join(' ')).toMatch(/is still present after the work/i);
  });
});

/* ---------------------------------------------------------------------------
 * Project rules
 * ------------------------------------------------------------------------ */

describe('the clean-scan trap', () => {
  /**
   * The diagnostic engine expresses "nothing was wrong" as a finding. A scan
   * after a successful repair therefore raises an INFO finding the before-scan
   * did not have, and counting that as new made a perfect result read as a
   * regression: every trim improved, the lean condition resolved, and the
   * verdict came back WORSENED.
   */
  const NOTHING_WRONG: ScanFinding = {
    findingId: 'no-faults-observed',
    title: 'No abnormal readings in this session',
    system: 'UNKNOWN',
    severity: 'INFO',
  };

  const result = verifyRepair({
    before: snapshot({ parameters: trims(19, 16), findings: [LEAN] }),
    after: snapshot({ at: AFTER_AT, parameters: trims(2, 1), findings: [NOTHING_WRONG] }),
    repair: REPAIR,
  });

  it('does not treat "nothing was wrong" as a new fault', () => {
    expect(result.verdict).toBe('CONSISTENT_WITH_REPAIR');
  });

  it('leaves the INFO finding out of the comparison entirely', () => {
    // It is the absence of a condition expressed as a finding, not a condition.
    expect(result.findings.some((f) => f.finding.findingId === 'no-faults-observed')).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.status).toBe('RESOLVED');
  });
});

describe('project rules', () => {
  it('discloses a simulated comparison', () => {
    const result = verifyRepair({
      before: snapshot({ isSimulated: true, parameters: trims(19, 16) }),
      after: snapshot({ at: AFTER_AT, isSimulated: true, parameters: trims(4, 3) }),
      repair: REPAIR,
    });

    expect(result.caveats.join(' ')).toMatch(/simulated vehicle/i);
  });

  it('says the repair description is taken at the owner’s word', () => {
    const result = verifyRepair({
      before: snapshot({ parameters: trims(19, 16) }),
      after: snapshot({ at: AFTER_AT, parameters: trims(4, 3) }),
      repair: REPAIR,
    });

    expect(result.caveats.join(' ')).toMatch(/does not verify what was actually done/i);
  });

  it('warns when the two scans were minutes apart', () => {
    const result = verifyRepair({
      before: snapshot({ parameters: trims(19, 16) }),
      after: snapshot({
        at: new Date(BEFORE_AT.getTime() + 10 * 60_000),
        parameters: trims(4, 3),
      }),
      repair: REPAIR,
    });

    expect(result.caveats.join(' ')).toMatch(/10 minutes apart/);
  });

  it('only judges parameters with a defensible direction', () => {
    const result = verifyRepair({
      before: snapshot({
        parameters: [
          { parameterId: 'ENGINE_RPM', condition: 'IDLE', mean: 700, samples: 200, unit: 'rpm' },
        ],
      }),
      after: snapshot({
        at: AFTER_AT,
        parameters: [
          { parameterId: 'ENGINE_RPM', condition: 'IDLE', mean: 900, samples: 200, unit: 'rpm' },
        ],
      }),
      repair: REPAIR,
    });

    // Engine speed changes between scans for reasons unrelated to a repair.
    // Including it would let noise decide a verdict.
    expect(result.parameters).toHaveLength(0);
    expect(result.verdict).toBe('INCONCLUSIVE');
  });
});
