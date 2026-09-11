import { describe, expect, it } from 'vitest';

import type { SensorReading } from '../telemetry';
import { DiagnosticSession, trackDelta, trackExtent, trackValues } from './session';
import { LIVE_SCAN_PARAMETERS, UNAVAILABLE_CAPABILITIES } from './parameter-groups';

const AT = new Date('2026-01-01T00:00:00Z');

function session() {
  return new DiagnosticSession({
    providerName: 'Simulated vehicle',
    isSimulated: true,
    scenario: 'NORMAL',
    startedAt: AT,
  });
}

function available(id: string, value: number, unit = 'rpm'): SensorReading {
  return { parameterId: id, at: AT, state: 'AVAILABLE', value, unit };
}

function missing(
  id: string,
  state: 'UNSUPPORTED' | 'UNAVAILABLE' | 'NOT_READING' | 'ERROR',
): SensorReading {
  return { parameterId: id, at: AT, state };
}

describe('recording', () => {
  it('builds a series from readings that carried a value', () => {
    const s = session();
    s.record([available('ENGINE_RPM', 700)], 0);
    s.record([available('ENGINE_RPM', 720)], 200);

    const track = s.track('ENGINE_RPM')!;
    expect(track.points).toEqual([
      { t: 0, value: 700 },
      { t: 200, value: 720 },
    ]);
    expect(track.latestValue).toBe(720);
    expect(track.unit).toBe('rpm');
  });

  it('never plots a reading that carried no value', () => {
    const s = session();
    s.record([available('ENGINE_RPM', 700)], 0);
    s.record([missing('ENGINE_RPM', 'UNAVAILABLE')], 200);

    const track = s.track('ENGINE_RPM')!;
    // A gap, not a zero and not an interpolation.
    expect(track.points).toHaveLength(1);
    expect(track.latestValue).toBeNull();
    expect(track.state).toBe('UNAVAILABLE');
  });

  it('keeps the reason a parameter has no value', () => {
    const s = session();
    s.record([missing('MISFIRE', 'UNSUPPORTED')], 0);

    const track = s.track('MISFIRE')!;
    expect(track.state).toBe('UNSUPPORTED');
    expect(track.points).toHaveLength(0);
    // Counted as seen, so the screen can distinguish it from a parameter
    // that was never requested at all.
    expect(track.samples).toBe(1);
  });

  it('resumes the series when a parameter starts answering again', () => {
    const s = session();
    s.record([available('ENGINE_RPM', 700)], 0);
    s.record([missing('ENGINE_RPM', 'ERROR')], 200);
    s.record([available('ENGINE_RPM', 690)], 400);

    const track = s.track('ENGINE_RPM')!;
    expect(track.points.map((p) => p.t)).toEqual([0, 400]);
    expect(track.state).toBe('AVAILABLE');
  });

  it('bounds memory by discarding the oldest points', () => {
    const s = new DiagnosticSession({
      providerName: 'x',
      isSimulated: true,
      maxPoints: 3,
      startedAt: AT,
    });
    for (let i = 0; i < 6; i += 1) s.record([available('ENGINE_RPM', i)], i * 100);

    const track = s.track('ENGINE_RPM')!;
    expect(track.points).toHaveLength(3);
    expect(trackValues(track)).toEqual([3, 4, 5]);
  });

  it('ignores readings once the session has ended', () => {
    const s = session();
    s.record([available('ENGINE_RPM', 700)], 0);
    s.end();
    s.record([available('ENGINE_RPM', 900)], 200);

    expect(s.track('ENGINE_RPM')!.points).toHaveLength(1);
    expect(s.isRunning).toBe(false);
  });

  it('returns null for a parameter never seen', () => {
    expect(session().track('NOT_REQUESTED')).toBeNull();
  });
});

describe('fault codes', () => {
  it('separates stored from pending', () => {
    const s = session();
    s.recordDtcs([
      { code: 'P0171', status: 'STORED', description: null, moduleAddress: '7E0' },
      { code: 'P0300', status: 'PENDING', description: null, moduleAddress: '7E0' },
    ]);

    expect(s.storedDtcs().map((d) => d.code)).toEqual(['P0171']);
    expect(s.pendingDtcs().map((d) => d.code)).toEqual(['P0300']);
    expect(s.allDtcs()).toHaveLength(2);
  });

  it('replaces the set rather than accumulating stale codes', () => {
    const s = session();
    s.recordDtcs([{ code: 'P0171', status: 'STORED', description: null, moduleAddress: null }]);
    s.recordDtcs([]);
    expect(s.allDtcs()).toHaveLength(0);
  });
});

describe('summary', () => {
  it('reports what was actually observed', () => {
    const s = session();
    s.record(
      [
        available('ENGINE_RPM', 700),
        available('COOLANT_TEMP', 88, '°C'),
        missing('MISFIRE', 'UNSUPPORTED'),
      ],
      0,
    );
    s.record([available('ENGINE_RPM', 705)], 500);

    const summary = s.summary();
    expect(summary.sampleCount).toBe(2);
    expect(summary.readingParameters).toBe(2);
    expect(summary.unsupportedParameters).toBe(1);
    expect(summary.durationMs).toBe(500);
    expect(summary.isSimulated).toBe(true);
    expect(summary.scenario).toBe('NORMAL');
  });

  it('is zero-length before anything is recorded', () => {
    const summary = session().summary();
    expect(summary.sampleCount).toBe(0);
    expect(summary.durationMs).toBe(0);
    expect(summary.endedAt).toBeNull();
  });
});

describe('series helpers', () => {
  it('reports the extent of a track', () => {
    const s = session();
    for (const v of [700, 2500, 900]) s.record([available('ENGINE_RPM', v)], 0);
    expect(trackExtent(s.track('ENGINE_RPM')!)).toEqual({ min: 700, max: 2500 });
  });

  it('has no extent without points', () => {
    const s = session();
    s.record([missing('ENGINE_RPM', 'UNSUPPORTED')], 0);
    expect(trackExtent(s.track('ENGINE_RPM')!)).toBeNull();
  });

  it('measures change across the track', () => {
    const s = session();
    s.record([available('LONG_FUEL_TRIM_1', 2, '%')], 0);
    s.record([available('LONG_FUEL_TRIM_1', 19, '%')], 1000);
    expect(trackDelta(s.track('LONG_FUEL_TRIM_1')!)).toBe(17);
  });

  it('distinguishes "no change" from "not enough data"', () => {
    const s = session();
    s.record([available('ENGINE_RPM', 700)], 0);
    // One point cannot express a change, so the answer is null, not zero.
    expect(trackDelta(s.track('ENGINE_RPM')!)).toBeNull();
  });
});

describe('live scan parameter list', () => {
  it('asks for every parameter without duplication', () => {
    expect(new Set(LIVE_SCAN_PARAMETERS).size).toBe(LIVE_SCAN_PARAMETERS.length);
  });

  it('covers what the brief lists', () => {
    for (const id of [
      'ENGINE_RPM',
      'VEHICLE_SPEED',
      'COOLANT_TEMP',
      'ENGINE_LOAD',
      'THROTTLE_POSITION',
      'MAF_RATE',
      'INTAKE_MAP',
      'SHORT_FUEL_TRIM_1',
      'LONG_FUEL_TRIM_1',
      'CONTROL_MODULE_VOLTAGE',
      'O2_S1_LAMBDA',
    ]) {
      expect(LIVE_SCAN_PARAMETERS, id).toContain(id);
    }
  });

  it('declares misfire counters as unobtainable rather than omitting them', () => {
    // The brief asks for them; this build cannot read Mode 06. Saying so is
    // the honest alternative to a silent gap or a fabricated number.
    const misfire = UNAVAILABLE_CAPABILITIES.find((c) => c.label.toLowerCase().includes('misfire'));
    expect(misfire).toBeDefined();
    expect(misfire!.reason).toMatch(/Mode 06/);
    expect(LIVE_SCAN_PARAMETERS.some((p) => p.includes('MISFIRE'))).toBe(false);
  });
});
