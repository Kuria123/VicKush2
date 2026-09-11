import { describe, expect, it } from 'vitest';

import {
  PARAMETERS,
  formatParameterValue,
  getParameter,
  isParameterId,
  isWithinEncodableRange,
  parametersInGroup,
} from './parameters';

describe('catalogue integrity', () => {
  it('has unique ids', () => {
    const ids = PARAMETERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique PIDs', () => {
    const pids = PARAMETERS.map((p) => p.pid);
    expect(new Set(pids).size).toBe(pids.length);
  });

  it('gives every parameter a coherent range', () => {
    for (const parameter of PARAMETERS) {
      expect(parameter.max, parameter.id).toBeGreaterThan(parameter.min);
      expect(parameter.unit.length, parameter.id).toBeGreaterThan(0);
      expect(parameter.decimals, parameter.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every PID inside a single byte', () => {
    for (const parameter of PARAMETERS) {
      expect(parameter.pid, parameter.id).toBeGreaterThanOrEqual(0);
      expect(parameter.pid, parameter.id).toBeLessThanOrEqual(0xff);
    }
  });
});

describe('known J1979 encodings', () => {
  // Spot-checks against the published standard, so a careless edit to the
  // catalogue is caught rather than silently accepted.
  it.each([
    ['ENGINE_RPM', 0x0c, 'rpm', 0, 16383.75],
    ['VEHICLE_SPEED', 0x0d, 'km/h', 0, 255],
    ['COOLANT_TEMP', 0x05, '°C', -40, 215],
    ['ENGINE_LOAD', 0x04, '%', 0, 100],
    ['SHORT_FUEL_TRIM_1', 0x06, '%', -100, 99.2],
    ['INTAKE_MAP', 0x0b, 'kPa', 0, 255],
    ['MAF_RATE', 0x10, 'g/s', 0, 655.35],
    ['CONTROL_MODULE_VOLTAGE', 0x42, 'V', 0, 65.535],
  ])('%s is PID %s in %s across %s..%s', (id, pid, unit, min, max) => {
    const parameter = getParameter(id as string);
    expect(parameter).not.toBeNull();
    expect(parameter!.pid).toBe(pid);
    expect(parameter!.unit).toBe(unit);
    expect(parameter!.min).toBe(min);
    expect(parameter!.max).toBe(max);
  });

  it('omits misfire counters, which are not Mode 01 PIDs', () => {
    expect(PARAMETERS.some((p) => p.id.includes('MISFIRE'))).toBe(false);
  });
});

describe('lookup', () => {
  it('returns null for an unknown id rather than a placeholder', () => {
    expect(getParameter('NOT_A_PARAMETER')).toBeNull();
  });

  it('narrows known ids', () => {
    expect(isParameterId('ENGINE_RPM')).toBe(true);
    expect(isParameterId('NOT_A_PARAMETER')).toBe(false);
  });

  it('groups parameters', () => {
    const fuel = parametersInGroup('FUEL');
    expect(fuel.length).toBeGreaterThan(0);
    expect(fuel.every((p) => p.group === 'FUEL')).toBe(true);
  });
});

describe('formatParameterValue', () => {
  it('uses the parameter’s own precision and unit', () => {
    expect(formatParameterValue('ENGINE_RPM', 750.4)).toBe('750 rpm');
    expect(formatParameterValue('CONTROL_MODULE_VOLTAGE', 14.123)).toBe('14.12 V');
    expect(formatParameterValue('SHORT_FUEL_TRIM_1', -3.25)).toBe('-3.3 %');
  });
});

describe('isWithinEncodableRange', () => {
  it('accepts values the encoding can represent', () => {
    expect(isWithinEncodableRange('VEHICLE_SPEED', 0)).toBe(true);
    expect(isWithinEncodableRange('VEHICLE_SPEED', 255)).toBe(true);
  });

  it('rejects values it cannot, which indicate a decode fault', () => {
    expect(isWithinEncodableRange('VEHICLE_SPEED', 256)).toBe(false);
    expect(isWithinEncodableRange('COOLANT_TEMP', -41)).toBe(false);
  });

  it('rejects anything for an unknown parameter', () => {
    expect(isWithinEncodableRange('NOT_A_PARAMETER', 1)).toBe(false);
  });
});
