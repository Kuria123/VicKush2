import { describe, expect, it } from 'vitest';

import { decodeDtcs, decodePid, decodeSupportedPids, decodeVin } from './decode';
import {
  buildPidCommand,
  INIT_COMMANDS,
  modeOnePayload,
  modePayload,
  parseResponse,
} from './elm327';

/**
 * Real OBD support, tested without a vehicle.
 *
 * This is the half that can be: the J1979 formulas are published, the byte
 * layouts are fixed, and both decoding and response parsing are pure. The
 * boundary values below come from the standard's own ranges rather than from
 * whatever a particular car happened to return.
 *
 * The transport is the part that cannot be verified here, and is deliberately
 * not in this file.
 */

/* ---------------------------------------------------------------------------
 * Decoding — checked against the published formulas
 * ------------------------------------------------------------------------ */

describe('J1979 decoders', () => {
  it('decodes engine speed as (256A + B) / 4', () => {
    // 0C 1A F8 → (256×26 + 248) / 4 = 1726 rpm
    expect(decodePid(0x0c, [0x1a, 0xf8])).toBe(1726);
    expect(decodePid(0x0c, [0x00, 0x00])).toBe(0);
    // The encoding's ceiling, which the catalogue states as the max.
    expect(decodePid(0x0c, [0xff, 0xff])).toBe(16383.75);
  });

  it('decodes temperatures with the 40 degree offset', () => {
    // A − 40, so 0x00 is −40 °C and not zero.
    expect(decodePid(0x05, [0x00])).toBe(-40);
    expect(decodePid(0x05, [0x5a])).toBe(50);
    expect(decodePid(0x0f, [0x28])).toBe(0);
    expect(decodePid(0x5c, [0xff])).toBe(215);
  });

  it('decodes fuel trim as a signed percentage about 128', () => {
    // 128 is exactly zero correction — the value a healthy engine sits near.
    expect(decodePid(0x06, [0x80])).toBe(0);
    expect(decodePid(0x06, [0x00])).toBe(-100);
    expect(decodePid(0x07, [0xff])).toBeCloseTo(99.22, 2);
    // +19% as a real ECU would encode it.
    expect(decodePid(0x07, [0x98])).toBeCloseTo(18.75, 2);
  });

  it('decodes percentages as A × 100 / 255', () => {
    expect(decodePid(0x11, [0x00])).toBe(0);
    expect(decodePid(0x11, [0xff])).toBe(100);
    expect(decodePid(0x04, [0x7f])).toBeCloseTo(49.8, 1);
  });

  it('decodes mass air flow as (256A + B) / 100', () => {
    expect(decodePid(0x10, [0x01, 0xf4])).toBe(5);
    expect(decodePid(0x10, [0xff, 0xff])).toBeCloseTo(655.35, 2);
  });

  it('decodes timing advance as (A / 2) − 64', () => {
    expect(decodePid(0x0e, [0x80])).toBe(0);
    expect(decodePid(0x0e, [0x00])).toBe(-64);
    expect(decodePid(0x0e, [0xff])).toBe(63.5);
  });

  it('decodes control module voltage in millivolts', () => {
    // 0x31 0x38 = 12600 → 12.6 V, the resting voltage of a healthy battery.
    expect(decodePid(0x42, [0x31, 0x38])).toBe(12.6);
  });

  it('decodes lambda as a ratio about 1', () => {
    expect(decodePid(0x24, [0x80, 0x00])).toBe(1);
    expect(decodePid(0x44, [0x80, 0x00])).toBe(1);
  });

  it('returns null for a short frame rather than decoding it', () => {
    // Decoding one byte as though it were two produces a plausible reading
    // from a corrupt one, which is worse than no reading (Rule 1).
    expect(decodePid(0x0c, [0x1a])).toBeNull();
    expect(decodePid(0x10, [])).toBeNull();
    expect(decodePid(0x42, [0x31])).toBeNull();
  });

  it('returns null for a PID it has no published formula for', () => {
    // An approximate decode of an unknown encoding is indistinguishable from
    // a fabricated reading.
    expect(decodePid(0xff, [0x12, 0x34])).toBeNull();
    expect(decodePid(0x01, [0x00, 0x07, 0xe1, 0x00])).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Supported-PID bitmaps
 * ------------------------------------------------------------------------ */

describe('supported PID bitmaps', () => {
  it('reads the most significant bit as the first PID', () => {
    // 0x80 00 00 00 means only PID 01 is supported.
    expect(decodeSupportedPids(0x00, [0x80, 0x00, 0x00, 0x00])).toEqual([0x01]);
  });

  it('reads the least significant bit as the thirty-second', () => {
    expect(decodeSupportedPids(0x00, [0x00, 0x00, 0x00, 0x01])).toEqual([0x20]);
  });

  it('decodes a realistic bitmap', () => {
    // BE 1F A8 13 — a common response from a petrol engine ECU.
    const supported = decodeSupportedPids(0x00, [0xbe, 0x1f, 0xa8, 0x13]);

    expect(supported).toContain(0x04); // load
    expect(supported).toContain(0x05); // coolant
    expect(supported).toContain(0x0c); // rpm
    expect(supported).toContain(0x0d); // speed
    expect(supported).not.toContain(0x02);
  });

  it('offsets correctly for the later bitmaps', () => {
    expect(decodeSupportedPids(0x20, [0x80, 0x00, 0x00, 0x00])).toEqual([0x21]);
    expect(decodeSupportedPids(0x40, [0x80, 0x00, 0x00, 0x00])).toEqual([0x41]);
  });

  it('returns nothing from a short bitmap', () => {
    expect(decodeSupportedPids(0x00, [0xbe, 0x1f])).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Fault codes
 * ------------------------------------------------------------------------ */

describe('DTC decoding', () => {
  it('decodes the letter from the top two bits', () => {
    expect(decodeDtcs([0x01, 0x71])).toEqual(['P0171']);
    expect(decodeDtcs([0x41, 0x71])).toEqual(['C0171']);
    expect(decodeDtcs([0x81, 0x71])).toEqual(['B0171']);
    expect(decodeDtcs([0xc1, 0x71])).toEqual(['U0171']);
  });

  it('decodes several codes from one payload', () => {
    expect(decodeDtcs([0x01, 0x71, 0x03, 0x02])).toEqual(['P0171', 'P0302']);
  });

  it('treats zero pairs as padding, not as P0000', () => {
    // ECUs return codes in fixed-size blocks and pad with zeros. Emitting a
    // code for each would invent faults out of empty space.
    expect(decodeDtcs([0x01, 0x71, 0x00, 0x00, 0x00, 0x00])).toEqual(['P0171']);
    expect(decodeDtcs([0x00, 0x00, 0x00, 0x00])).toEqual([]);
  });

  it('pads the hex digits so a code is always five characters', () => {
    expect(decodeDtcs([0x00, 0x01])).toEqual(['P0001']);
  });

  it('ignores a trailing odd byte rather than decoding half a code', () => {
    expect(decodeDtcs([0x01, 0x71, 0x03])).toEqual(['P0171']);
  });
});

/* ---------------------------------------------------------------------------
 * VIN
 * ------------------------------------------------------------------------ */

describe('VIN decoding', () => {
  const vin = '1M8GDM9AXKP042788';

  it('decodes exactly seventeen characters', () => {
    const bytes = [...vin].map((c) => c.charCodeAt(0));
    expect(decodeVin(bytes)).toBe(vin);
  });

  it('drops the padding and message-count bytes some ECUs prefix', () => {
    const bytes = [0x00, 0x00, 0x00, ...[...vin].map((c) => c.charCodeAt(0))];
    expect(decodeVin(bytes)).toBe(vin);
  });

  it('returns null for anything that is not seventeen characters', () => {
    // A partial VIN would flow into the identification score as evidence.
    expect(decodeVin([...'1M8GDM9A'].map((c) => c.charCodeAt(0)))).toBeNull();
    expect(decodeVin([])).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * ELM327 responses — the messy reality
 * ------------------------------------------------------------------------ */

describe('ELM327 response parsing', () => {
  it('builds a mode 01 command', () => {
    expect(buildPidCommand(0x01, 0x0c)).toBe('010C');
    expect(buildPidCommand(0x01, 0x05)).toBe('0105');
  });

  it('turns headers on during initialisation', () => {
    // Without headers, two modules answering the same request are
    // indistinguishable.
    expect(INIT_COMMANDS).toContain('ATH1');
    expect(INIT_COMMANDS).toContain('ATE0');
    expect(INIT_COMMANDS[0]).toBe('ATZ');
  });

  it('parses a plain single-line response', () => {
    const result = parseResponse('410C1AF8\r\r>', 0x01);

    expect(result.kind).toBe('DATA');
    if (result.kind !== 'DATA') return;
    expect(modeOnePayload(result.bytes, 0x0c)).toEqual([0x1a, 0xf8]);
  });

  it('strips the spaces a clone inserts despite ATS0', () => {
    const result = parseResponse('41 0C 1A F8\r>', 0x01);

    expect(result.kind).toBe('DATA');
    if (result.kind !== 'DATA') return;
    expect(decodePid(0x0c, modeOnePayload(result.bytes, 0x0c)!)).toBe(1726);
  });

  it('discards a SEARCHING line without treating it as data', () => {
    const result = parseResponse('SEARCHING...\r410C1AF8\r>', 0x01);

    expect(result.kind).toBe('DATA');
    if (result.kind !== 'DATA') return;
    expect(modeOnePayload(result.bytes, 0x0c)).toEqual([0x1a, 0xf8]);
  });

  it('keeps the responding ECU header when one is present', () => {
    const result = parseResponse('7E8 04 41 0C 1A F8\r>', 0x01);

    expect(result.kind).toBe('DATA');
    if (result.kind !== 'DATA') return;
    expect(result.header).toBe('7E8');
    expect(modeOnePayload(result.bytes, 0x0c)).toEqual([0x1a, 0xf8]);
  });

  it('reassembles a multi-frame reply in index order', () => {
    // A VIN arrives across several frames, out of order on a busy bus. The
    // frame indices are structural: decoding them as data shifts every byte.
    const raw = ['014', '0:4902013144', '2:4D394158', '1:4D384744'].join('\r');
    const result = parseResponse(raw, 0x09);

    expect(result.kind).toBe('DATA');
    if (result.kind !== 'DATA') return;
    expect(result.bytes[0]).toBe(0x49);
    expect(result.bytes[1]).toBe(0x02);
  });

  it('reports NO DATA as an absence, never as zero', () => {
    const result = parseResponse('NO DATA\r>', 0x01);

    expect(result.kind).toBe('NO_DATA');
    if (result.kind !== 'NO_DATA') return;
    expect(result.reason).toMatch(/probably not supported/i);
  });

  it('reports a bus error as a connection fault, not a reading', () => {
    const result = parseResponse('CAN ERROR\r>', 0x01);

    expect(result.kind).toBe('NO_DATA');
    if (result.kind !== 'NO_DATA') return;
    expect(result.reason).toMatch(/fault in the connection, not a reading/i);
  });

  it('reports a negative response rather than swallowing it', () => {
    // 7F 01 12 — mode 01 rejected, sub-function not supported.
    const result = parseResponse('7F0112\r>', 0x01);

    expect(result.kind).toBe('NO_DATA');
    if (result.kind !== 'NO_DATA') return;
    expect(result.reason).toMatch(/refused the request/i);
  });

  it('recognises OK for an AT command', () => {
    expect(parseResponse('OK\r>', 0x01).kind).toBe('OK');
  });

  it('refuses a response to a different mode', () => {
    // A late reply to a previous command decoded against the current one
    // produces a confident reading of the wrong parameter.
    const result = parseResponse('430171\r>', 0x01);
    expect(result.kind).toBe('UNPARSEABLE');
  });

  it('refuses a payload whose PID echo does not match', () => {
    const result = parseResponse('410D45\r>', 0x01);

    expect(result.kind).toBe('DATA');
    if (result.kind !== 'DATA') return;
    // Asked for RPM, the adapter answered with speed. Not decoded as RPM.
    expect(modeOnePayload(result.bytes, 0x0c)).toBeNull();
    expect(modeOnePayload(result.bytes, 0x0d)).toEqual([0x45]);
  });

  it('parses a mode 03 fault code response end to end', () => {
    const result = parseResponse('4301710302\r>', 0x03);

    expect(result.kind).toBe('DATA');
    if (result.kind !== 'DATA') return;
    expect(decodeDtcs(modePayload(result.bytes, 0x03)!)).toEqual(['P0171', 'P0302']);
  });

  it('treats an empty response as an absence', () => {
    expect(parseResponse('>', 0x01).kind).toBe('NO_DATA');
    expect(parseResponse('', 0x01).kind).toBe('NO_DATA');
  });
});
