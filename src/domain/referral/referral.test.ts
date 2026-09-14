import { describe, expect, it } from 'vitest';

import type { RankedCause } from '@/domain/differential';

import { buildReferralReport } from './engine';
import { formatReferralReport } from './format';
import type { ReferralInput } from './types';

/**
 * The referral report.
 *
 * This is the output that leaves the building. Everything else this product
 * produces is read by the owner, in context, with the disclosures on screen
 * around it; this arrives on its own, in front of somebody who was not there
 * for the scan and will act on it. So the tests here are about what the text
 * can and cannot be made to say.
 */

function cause(overrides: Partial<RankedCause> = {}): RankedCause {
  return {
    id: 'unmetered-air',
    label: 'Air entering downstream of the airflow sensor',
    system: 'FUEL',
    mechanism:
      'Air reaching the cylinders without being measured, so the fuelling is calculated short.',
    status: 'SUPPORTED',
    confidence: 72,
    points: { earned: 36, available: 50 },
    contributions: [],
    exclusions: [],
    unmet: [],
    keyObservationMade: true,
    ...overrides,
  };
}

function input(overrides: Partial<ReferralInput> = {}): ReferralInput {
  return {
    preparedAt: new Date('2026-03-04T09:00:00Z'),
    vehicle: { name: 'Toyota Harrier 2018', spec: '2.0 L petrol, CVT', vin: null },
    concern: null,
    scan: {
      at: new Date('2026-03-03T14:20:00Z'),
      providerName: 'Test provider',
      isSimulated: false,
      conditionsObserved: ['IDLE', 'LIGHT_LOAD'],
    },
    verdict: 'SINGLE_LEADING',
    findings: [
      {
        title: 'Fuel trims high at idle',
        severity: 'SIGNIFICANT',
        supporting: ['Long term fuel trim averaged +18.4% at idle across 140 samples.'],
      },
    ],
    causes: [cause()],
    codes: [{ code: 'P0171', status: 'STORED' }],
    testsPerformed: [],
    repairs: [],
    diagnosisLimitations: [],
    ...overrides,
  };
}

describe('the concern', () => {
  it('carries the owner own words through unchanged', () => {
    const report = buildReferralReport(input({ concern: '  Idle vibration when cold  ' }));

    expect(report.concern).toEqual({ stated: true, words: 'Idle vibration when cold' });
    expect(formatReferralReport(report)).toContain('Idle vibration when cold');
  });

  it('is never inferred from what the scan found', () => {
    // The temptation is obvious: there are findings, so write a complaint from
    // them. That would put words in the owner's mouth and hand them to a
    // mechanic as the reason for the visit.
    const report = buildReferralReport(input({ concern: null }));

    expect(report.concern.stated).toBe(false);
    const text = formatReferralReport(report);
    expect(text).toContain('Concern:');
    expect(text).toContain('Not stated');
  });

  it('treats whitespace as no concern at all', () => {
    expect(buildReferralReport(input({ concern: '   ' })).concern.stated).toBe(false);
  });
});

describe('what the report refuses to say', () => {
  const everything = () => {
    const report = buildReferralReport(
      input({
        concern: 'Rough idle',
        repairs: [
          {
            performedAt: new Date('2026-02-01T00:00:00Z'),
            summary: 'Spark plugs changed',
            verdict: 'NOT_DEMONSTRATED',
          },
        ],
      }),
    );
    return formatReferralReport(report);
  };

  it('never tells anyone to fit a part', () => {
    /*
     * Every stage before this refused to name a component, and this is the
     * output where that discipline is most likely to slip: the reader is a
     * mechanic, and "just tell them what to change" reads as helpfulness.
     * Which component failed is settled by inspection, not by a scan (Rule 9).
     */
    const banned =
      /\b(replace|replacing|install|installing|fit a|fit the|refit|buy|purchase|part number)\b/i;
    expect(everything()).not.toMatch(banned);
  });

  it('never states what a fault code means', () => {
    const report = buildReferralReport(input());
    expect(report.codes.every((code) => code.interpreted === false)).toBe(true);

    const text = formatReferralReport(report);
    expect(text).toContain('P0171');
    expect(text).toContain('does not interpret them');
  });

  it('never says a repair fixed anything', () => {
    const verdicts = [
      'CONSISTENT_WITH_REPAIR',
      'NOT_DEMONSTRATED',
      'WORSENED',
      'INCONCLUSIVE',
    ] as const;

    for (const verdict of verdicts) {
      const report = buildReferralReport(
        input({
          repairs: [
            { performedAt: new Date('2026-02-01T00:00:00Z'), summary: 'Work done', verdict },
          ],
        }),
      );

      const outcome = report.previousRepairs[0]?.outcome ?? '';
      expect(outcome, verdict).not.toMatch(/\bfixed\b|\bresolved\b|\bcured\b/i);
      expect(outcome.length, verdict).toBeGreaterThan(0);
    }
  });

  it('never claims the vehicle is safe to drive', () => {
    /*
     * The phrase does appear, in the line that disclaims it. So the assertion
     * is about where: nothing above the "Not claimed" block may mention
     * driveability, because that is the section a reader treats as findings.
     */
    const text = everything();
    const body = text.slice(0, text.indexOf('Not claimed:'));

    expect(body).not.toMatch(/safe to drive|unsafe to drive|roadworthy/i);
    expect(text).toContain('whether the vehicle is safe to drive');
  });

  it('says the mechanic own judgement comes first', () => {
    expect(everything()).toContain('The mechanic has the vehicle');
  });
});

describe('simulated data', () => {
  it('leads the report, not a footnote at the bottom', () => {
    const report = buildReferralReport(
      input({
        scan: {
          at: new Date('2026-03-03T14:20:00Z'),
          providerName: 'Vehicle simulator',
          isSimulated: true,
          conditionsObserved: ['IDLE'],
        },
      }),
    );

    // Rule 2 matters more here than on any screen: a mechanic acting on
    // simulated readings is working from fiction about a real car.
    expect(report.limitations[0]).toContain('SIMULATION MODE');

    const text = formatReferralReport(report);
    expect(text.split('\n')[0]).toContain('SIMULATION MODE');
    expect(text).toContain('Do not use it to make a repair decision');
  });

  it('says nothing of the sort when the scan was real', () => {
    const text = formatReferralReport(buildReferralReport(input()));
    expect(text).not.toContain('SIMULATION MODE');
  });
});

describe('limitations', () => {
  it('are present on every report, including an empty one', () => {
    const report = buildReferralReport(
      input({ scan: null, verdict: null, findings: [], causes: [], codes: [] }),
    );

    expect(report.limitations.length).toBeGreaterThan(0);
    expect(report.limitations.join(' ')).toContain('No scan has been saved');
  });

  it('state which conditions the scan actually covered', () => {
    const report = buildReferralReport(input());
    expect(report.limitations.join(' ')).toContain('idle, light_load');
  });

  it('always say braking and suspension were not assessed', () => {
    // The systems a mechanic is most likely to assume were covered, and the
    // ones this interface carries no data for at all.
    expect(buildReferralReport(input()).limitations.join(' ')).toContain(
      'Braking and suspension',
    );
  });

  it('carry the diagnosis own stated limits through verbatim', () => {
    const report = buildReferralReport(
      input({
        diagnosisLimitations: ['Engine displacement is unknown, so airflow was not judged.'],
      }),
    );

    expect(report.limitations).toContain(
      'Engine displacement is unknown, so airflow was not judged.',
    );
  });
});

describe('candidates', () => {
  it('are mechanisms, and a ruled-out one is not offered as one', () => {
    const report = buildReferralReport(
      input({
        causes: [
          cause(),
          cause({ id: 'fuel-pressure', label: 'Fuel supply pressure low', status: 'RULED_OUT' }),
        ],
      }),
    );

    expect(report.candidates.map((c) => c.label)).toEqual([
      'Air entering downstream of the airflow sensor',
    ]);
    // Exclusion is a result, so it is reported -- just not as something to
    // investigate.
    expect(report.limitations.join(' ')).toContain('Fuel supply pressure low');
  });

  it('say so when the defining observation was never made', () => {
    const report = buildReferralReport(input({ causes: [cause({ keyObservationMade: false })] }));

    expect(report.candidates[0]?.keyObservationMade).toBe(false);
    expect(formatReferralReport(report)).toContain('would define this was not made');
  });
});

describe('recommended confirmation', () => {
  it('offers a measurement that bears on an open candidate', () => {
    const report = buildReferralReport(input());

    expect(report.recommendedConfirmation.length).toBeGreaterThan(0);
    for (const test of report.recommendedConfirmation) {
      expect(test.question.length).toBeGreaterThan(0);
    }
  });

  it('does not ask for a test whose result is already in this report', () => {
    const all = buildReferralReport(input()).recommendedConfirmation;
    const first = all[0];
    expect(first).toBeDefined();

    const after = buildReferralReport(input({ testsPerformed: [first!.testId] }));
    expect(after.recommendedConfirmation.map((t) => t.testId)).not.toContain(first!.testId);
  });

  it('offers nothing when every candidate was ruled out', () => {
    const report = buildReferralReport(input({ causes: [cause({ status: 'RULED_OUT' })] }));

    expect(report.recommendedConfirmation).toEqual([]);
  });
});

describe('a repair with no scan after it', () => {
  it('reports its effect as unknown rather than leaving it blank', () => {
    const report = buildReferralReport(
      input({
        repairs: [
          {
            performedAt: new Date('2026-02-01T00:00:00Z'),
            summary: 'Intake hose reseated',
            verdict: null,
          },
        ],
      }),
    );

    expect(report.previousRepairs[0]?.outcome).toContain('its effect is unknown');
  });
});

describe('the rendered text', () => {
  it('has the sections a mechanic reads, in that order', () => {
    const text = formatReferralReport(buildReferralReport(input({ concern: 'Rough idle' })));
    const order = [
      'Vehicle:',
      'Concern:',
      'Evidence:',
      'Fault codes:',
      'Candidate mechanisms:',
      'Recommended confirmation:',
      'Previous repairs:',
      'What this report does not establish:',
    ];

    let cursor = -1;
    for (const heading of order) {
      const at = text.indexOf(heading);
      expect(at, heading).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('carries the measured numbers, not just the conclusion', () => {
    // "Fuel trims high" tells a mechanic nothing they cannot see themselves.
    // "+18.4% at idle across 140 samples" is the part they cannot get without
    // having been there.
    expect(formatReferralReport(buildReferralReport(input()))).toContain('+18.4%');
  });

  it('says so plainly when there is nothing to report', () => {
    const text = formatReferralReport(
      buildReferralReport(input({ scan: null, verdict: null, findings: [], causes: [], codes: [] })),
    );

    expect(text).toContain('None stored at the time of the scan.');
    expect(text).toContain('None recorded in this application.');
  });
});
