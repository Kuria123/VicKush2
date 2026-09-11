import { describe, expect, it } from 'vitest';

import { describeDtcStructure, isValidDtc, normalizeDtc, parseDtc } from './dtc';

describe('normalizeDtc', () => {
  it('uppercases and strips whitespace', () => {
    expect(normalizeDtc(' p0171 ')).toBe('P0171');
  });
});

describe('isValidDtc', () => {
  it.each(['P0171', 'B1234', 'C0035', 'U0100', 'P30AB'])('accepts %s', (code) => {
    expect(isValidDtc(code)).toBe(true);
  });

  it.each([
    ['wrong system letter', 'X0171'],
    ['authority digit out of range', 'P4171'],
    ['too short', 'P017'],
    ['too long', 'P01715'],
    ['non-hex body', 'P01G1'],
    ['empty', ''],
  ])('rejects %s', (_label, code) => {
    expect(isValidDtc(code)).toBe(false);
  });
});

describe('parseDtc', () => {
  it('decodes system, authority and subsystem', () => {
    const parsed = parseDtc('P0171');
    expect(parsed).not.toBeNull();
    expect(parsed!.system).toBe('POWERTRAIN');
    expect(parsed!.authority).toBe('GENERIC');
    expect(parsed!.subsystem).toBe('Fuel and air metering');
  });

  it.each([
    ['P', 'POWERTRAIN'],
    ['B', 'BODY'],
    ['C', 'CHASSIS'],
    ['U', 'NETWORK'],
  ])('maps the %s prefix to %s', (prefix, system) => {
    expect(parseDtc(`${prefix}0100`)!.system).toBe(system);
  });

  it('recognises a manufacturer-defined code', () => {
    expect(parseDtc('P1234')!.authority).toBe('MANUFACTURER');
  });

  it('reports the P3 range as mixed rather than guessing', () => {
    // Part of P3xxx is manufacturer-defined and part is standardised, and the
    // digit alone cannot say which.
    expect(parseDtc('P3000')!.authority).toBe('MIXED');
  });

  it('decodes the misfire subsystem', () => {
    expect(parseDtc('P0302')!.subsystem).toBe('Ignition system or misfire');
  });

  it('leaves the subsystem null for non-powertrain codes', () => {
    // The subsystem digit's meaning is only mapped for P codes here.
    expect(parseDtc('B0001')!.subsystem).toBeNull();
  });

  it('returns null rather than a partial guess for malformed input', () => {
    expect(parseDtc('NOPE')).toBeNull();
  });

  it('never claims to know what the fault means', () => {
    const parsed = parseDtc('P0171')!;
    // Structure only. No description field exists to be fabricated.
    expect(Object.keys(parsed).sort()).toEqual(['authority', 'code', 'subsystem', 'system']);
  });
});

describe('describeDtcStructure', () => {
  it('describes structure without asserting a cause', () => {
    const text = describeDtcStructure(parseDtc('P0171')!);
    expect(text).toBe('Powertrain, standardised · Fuel and air metering');
    expect(text.toLowerCase()).not.toContain('lean');
  });

  it('omits the subsystem when it is not known', () => {
    expect(describeDtcStructure(parseDtc('U0100')!)).toBe('Network, standardised');
  });
});
