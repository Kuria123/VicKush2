import { describe, expect, it } from 'vitest';

import { detectSignals, type PredictionInput, type ScanRecord } from './engine';

/**
 * Predictive maintenance.
 *
 * The brief states the requirement as a contrast, so most of these tests are
 * about the second half of it:
 *
 *   "Battery health declining."  — yes
 *   "Battery definitely failed." — no
 */

const DAY = 86_400_000;
const START = new Date('2026-01-01T09:00:00Z').getTime();

function at(index: number): Date {
  return new Date(START + index * 7 * DAY);
}

function scans(count: number, overrides: Partial<ScanRecord>[] = []): ScanRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    sessionId: `s${i}`,
    at: at(i),
    dtcCodes: [],
    conditionCount: 0,
    ...overrides[i],
  }));
}

/** The brief's own series. */
const DECLINING_VOLTAGE = [12.7, 12.6, 12.4, 12.2, 12.1];

function input(overrides: Partial<PredictionInput> = {}): PredictionInput {
  return {
    parameters: [],
    scans: scans(5),
    ...overrides,
  };
}

const voltageHistory = (values: number[]) => ({
  parameterId: 'CONTROL_MODULE_VOLTAGE',
  condition: 'IDLE',
  unit: 'V',
  points: values.map((value, i) => ({ at: at(i), value })),
});

/* ---------------------------------------------------------------------------
 * The brief's example
 * ------------------------------------------------------------------------ */

describe('the worked example', () => {
  const report = detectSignals(input({ parameters: [voltageHistory(DECLINING_VOLTAGE)] }));
  const signal = report.signals.find((s) => s.kind === 'VOLTAGE_DECLINE')!;

  it('detects the declining voltage', () => {
    expect(signal).toBeDefined();
    expect(signal.headline).toMatch(/System voltage is declining across scans/);
  });

  it('says declining, never failed', () => {
    expect(signal.headline).toMatch(/declining/i);
    expect(signal.headline).not.toMatch(/\bfailed\b|\bdefinitely\b|\bwill fail\b/i);
  });

  it('finishes the sentence the reader might otherwise finish themselves', () => {
    expect(signal.notClaiming).toMatch(/does not say the battery or alternator has failed/i);
    expect(signal.notClaiming).toMatch(/or when either might/i);
  });

  it('shows the series so the claim can be checked', () => {
    expect(signal.detail).toContain('12.7 V');
    expect(signal.detail).toContain('12.1 V');
    expect(signal.series).toHaveLength(5);
  });

  it('suggests a measurement rather than a part', () => {
    expect(signal.suggestedCheck).toMatch(/measure/i);
    expect(signal.suggestedCheck).not.toMatch(/\breplace\b|\bfit\b|\bbuy\b/i);
  });
});

/* ---------------------------------------------------------------------------
 * What it refuses to do
 * ------------------------------------------------------------------------ */

describe('refusals', () => {
  it('claims no direction from fewer than three scans', () => {
    const report = detectSignals(
      input({ scans: scans(2), parameters: [voltageHistory([12.7, 12.1])] }),
    );

    expect(report.signals).toHaveLength(0);
    expect(report.limitations[0]).toMatch(/at least 3 saved scans/i);
  });

  it('never predicts a date, a remaining life or an interval', () => {
    const report = detectSignals(input({ parameters: [voltageHistory(DECLINING_VOLTAGE)] }));

    // Only what a signal asserts. The limitations legitimately use these
    // phrases to say what is NOT done, and a check that cannot tell a claim
    // from a denial of one would forbid the disclaimer along with the claim.
    const claims = report.signals
      .flatMap((signal) => [signal.headline, signal.detail, signal.suggestedCheck])
      .join(' ');

    expect(claims).not.toMatch(/\bwill fail\b|\bexpect(ed)? to fail\b|\bremaining life\b/i);
    expect(claims).not.toMatch(/\bwithin \d+ (days|weeks|months)\b/i);
    expect(claims).not.toMatch(/\bdefinitely\b|\bcertainly\b/i);

    // And the report states plainly that it does not extrapolate.
    expect(report.limitations.join(' ')).toMatch(/Nothing here is extrapolated/i);
    expect(report.limitations.join(' ')).toMatch(/No failure date, remaining life/i);
  });

  it('ignores a direction that is not adverse', () => {
    // Voltage climbing is not a fault, and flagging it would teach the reader
    // to ignore this panel.
    const report = detectSignals(
      input({ parameters: [voltageHistory([12.1, 12.3, 12.5, 12.7, 12.9])] }),
    );

    expect(report.signals.filter((s) => s.kind === 'VOLTAGE_DECLINE')).toHaveLength(0);
  });

  it('says nothing found rather than implying nothing is changing', () => {
    const steady = detectSignals(
      input({ parameters: [voltageHistory([12.6, 12.55, 12.6, 12.58, 12.6])] }),
    );

    expect(steady.signals).toHaveLength(0);
    expect(steady.limitations.join(' ')).toMatch(/not a statement that nothing is changing/i);
  });

  it('never interprets what a repeated code means', () => {
    const report = detectSignals(
      input({
        scans: scans(4, [
          { dtcCodes: ['P0171'] },
          { dtcCodes: ['P0171'] },
          {},
          { dtcCodes: ['P0171'] },
        ]),
      }),
    );

    const repeated = report.signals.find((s) => s.kind === 'REPEATED_DTC')!;
    expect(repeated.headline).toMatch(/P0171 has been recorded in 3 of 4 scans/);
    expect(repeated.notClaiming).toMatch(/not interpreted/i);
    // No meaning is attached anywhere.
    expect(repeated.headline + repeated.detail).not.toMatch(/lean|rich|sensor|oxygen/i);
  });

  it('does not raise a code seen only once', () => {
    const report = detectSignals(
      input({ scans: scans(4, [{ dtcCodes: ['P0171'] }]) }),
    );

    expect(report.signals.filter((s) => s.kind === 'REPEATED_DTC')).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------------------
 * Strength
 * ------------------------------------------------------------------------ */

describe('strength reflects the evidence, not the severity', () => {
  it('is strong across five consistent scans', () => {
    const report = detectSignals(input({ parameters: [voltageHistory(DECLINING_VOLTAGE)] }));
    expect(report.signals[0]?.strength).toBe('STRONG');
  });

  it('is weaker across the minimum three', () => {
    const report = detectSignals(
      input({ scans: scans(3), parameters: [voltageHistory([12.7, 12.4, 12.1])] }),
    );

    // Same direction, same magnitude, less history behind it.
    const signal = report.signals.find((s) => s.kind === 'VOLTAGE_DECLINE')!;
    expect(signal.strength).toBe('MODERATE');
  });

  it('warns that three scans is a thinner basis than five', () => {
    const report = detectSignals(
      input({ scans: scans(3), parameters: [voltageHistory([12.7, 12.4, 12.1])] }),
    );

    expect(report.limitations.join(' ')).toMatch(/rests on 3 scans/i);
  });
});

/* ---------------------------------------------------------------------------
 * Fault frequency
 * ------------------------------------------------------------------------ */

describe('rising fault frequency', () => {
  const report = detectSignals(
    input({
      scans: scans(4, [
        { conditionCount: 1 },
        { conditionCount: 2 },
        { conditionCount: 3 },
        { conditionCount: 4 },
      ]),
    }),
  );

  it('reports that more is being found, not that the vehicle is deteriorating', () => {
    const signal = report.signals.find((s) => s.kind === 'RISING_FAULT_FREQUENCY')!;

    expect(signal.headline).toMatch(/More is being found per scan/i);
    expect(signal.headline).not.toMatch(/deteriorat|getting worse|failing/i);
  });

  it('offers the confound rather than hiding it', () => {
    const signal = report.signals.find((s) => s.kind === 'RISING_FAULT_FREQUENCY')!;
    // Later scans may simply have covered more conditions.
    expect(signal.notClaiming).toMatch(/covered more operating conditions/i);
  });

  it('has no system, because it bears on none', () => {
    const signal = report.signals.find((s) => s.kind === 'RISING_FAULT_FREQUENCY')!;
    expect(signal.system).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Limits
 * ------------------------------------------------------------------------ */

describe('limitations', () => {
  it('names the parameters it has no history for', () => {
    const report = detectSignals(input({ parameters: [voltageHistory(DECLINING_VOLTAGE)] }));
    expect(report.limitations.join(' ')).toMatch(/Coolant temperature/);
    expect(report.limitations.join(' ')).toMatch(/no history is available/i);
  });

  it('reports the span it drew on', () => {
    const report = detectSignals(input());
    expect(report.scansConsidered).toBe(5);
    expect(report.spanDays).toBe(28);
  });
});
