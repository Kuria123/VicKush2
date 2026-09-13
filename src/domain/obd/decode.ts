/**
 * Decoding SAE J1979 Mode 01 responses into physical values.
 *
 * This is the half of real OBD support that can be verified without a vehicle.
 * The formulas are published in J1979 / ISO 15031-5, the byte layouts are
 * fixed, and a decoder is a pure function — so it can be tested exhaustively
 * against the standard's own boundary values here, today, with no adapter
 * plugged into anything.
 *
 * The transport cannot be verified that way, and is kept strictly separate for
 * exactly that reason. Mixing them would make the untestable part contaminate
 * the testable one, and would leave the most error-prone code in the stack —
 * arithmetic on bytes — resting on a hardware test nobody here can run.
 *
 * Every decoder returns null rather than a number when the payload is the
 * wrong length. A short frame is a real occurrence on a noisy bus, and
 * decoding three bytes as though they were four produces a plausible reading
 * from a corrupt one, which is worse than no reading at all (Rule 1).
 */

export interface DecodedValue {
  parameterId: string;
  value: number;
}

type Decoder = (bytes: readonly number[]) => number | null;

/** Guards length before decoding. A short frame yields null, never a guess. */
function needs(count: number, decode: (b: readonly number[]) => number): Decoder {
  return (bytes) => (bytes.length >= count ? decode(bytes) : null);
}

/**
 * The published formulas, one per PID.
 *
 * Written to mirror the standard's own expressions rather than being
 * pre-simplified, so a reader can check each against J1979 directly. `A` is
 * the first data byte, `B` the second.
 */
export const DECODERS: Record<number, Decoder> = {
  // 04 — Calculated engine load: A × 100 / 255 (%)
  0x04: needs(1, ([a]) => (a! * 100) / 255),

  // 05 — Engine coolant temperature: A − 40 (°C)
  0x05: needs(1, ([a]) => a! - 40),

  // 06–09 — Fuel trims: (A − 128) × 100 / 128 (%)
  0x06: needs(1, ([a]) => ((a! - 128) * 100) / 128),
  0x07: needs(1, ([a]) => ((a! - 128) * 100) / 128),
  0x08: needs(1, ([a]) => ((a! - 128) * 100) / 128),
  0x09: needs(1, ([a]) => ((a! - 128) * 100) / 128),

  // 0A — Fuel pressure (gauge): A × 3 (kPa)
  0x0a: needs(1, ([a]) => a! * 3),

  // 0B — Intake manifold absolute pressure: A (kPa)
  0x0b: needs(1, ([a]) => a!),

  // 0C — Engine speed: (256A + B) / 4 (rpm)
  0x0c: needs(2, ([a, b]) => (256 * a! + b!) / 4),

  // 0D — Vehicle speed: A (km/h)
  0x0d: needs(1, ([a]) => a!),

  // 0E — Timing advance: (A / 2) − 64 (° before TDC)
  0x0e: needs(1, ([a]) => a! / 2 - 64),

  // 0F — Intake air temperature: A − 40 (°C)
  0x0f: needs(1, ([a]) => a! - 40),

  // 10 — Mass air flow: (256A + B) / 100 (g/s)
  0x10: needs(2, ([a, b]) => (256 * a! + b!) / 100),

  // 11 — Throttle position: A × 100 / 255 (%)
  0x11: needs(1, ([a]) => (a! * 100) / 255),

  // 14 — O2 sensor 1 voltage: A / 200 (V). B is the trim and is not this value.
  0x14: needs(1, ([a]) => a! / 200),

  // 1F — Run time since engine start: 256A + B (s)
  0x1f: needs(2, ([a, b]) => 256 * a! + b!),

  // 24 — O2 sensor 1 lambda: (256A + B) × 2 / 65536 (ratio)
  0x24: needs(2, ([a, b]) => ((256 * a! + b!) * 2) / 65536),

  // 2F — Fuel tank level: A × 100 / 255 (%)
  0x2f: needs(1, ([a]) => (a! * 100) / 255),

  // 33 — Absolute barometric pressure: A (kPa)
  0x33: needs(1, ([a]) => a!),

  // 42 — Control module voltage: (256A + B) / 1000 (V)
  0x42: needs(2, ([a, b]) => (256 * a! + b!) / 1000),

  // 43 — Absolute load value: (256A + B) × 100 / 255 (%)
  0x43: needs(2, ([a, b]) => ((256 * a! + b!) * 100) / 255),

  // 44 — Commanded equivalence ratio: (256A + B) × 2 / 65536 (ratio)
  0x44: needs(2, ([a, b]) => ((256 * a! + b!) * 2) / 65536),

  // 46 — Ambient air temperature: A − 40 (°C)
  0x46: needs(1, ([a]) => a! - 40),

  // 5C — Engine oil temperature: A − 40 (°C)
  0x5c: needs(1, ([a]) => a! - 40),
};

export function isDecodablePid(pid: number): boolean {
  return pid in DECODERS;
}

/**
 * Decodes a Mode 01 payload.
 *
 * Returns null for an unknown PID as well as for a short frame. A PID this
 * build has no published formula for must not be guessed at — an approximate
 * decode of an unknown encoding is indistinguishable from a fabricated
 * reading.
 */
export function decodePid(pid: number, bytes: readonly number[]): number | null {
  const decoder = DECODERS[pid];
  if (!decoder) return null;

  const value = decoder(bytes);
  if (value === null || !Number.isFinite(value)) return null;
  return value;
}

/* -------------------------------------------------------------------------
 * Supported-PID bitmaps
 * ---------------------------------------------------------------------- */

/**
 * Decodes a supported-PID bitmap (PIDs 00, 20, 40, 60…).
 *
 * Four bytes, most significant bit first, describing the next 32 PIDs. This is
 * how a vehicle states what it answers to, and honouring it is what stops the
 * product asking for readings the ECU never offered — and stops the UI
 * implying a capability that does not exist.
 */
export function decodeSupportedPids(basePid: number, bytes: readonly number[]): number[] {
  if (bytes.length < 4) return [];

  const supported: number[] = [];

  for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
    const byte = bytes[byteIndex]!;
    for (let bit = 0; bit < 8; bit += 1) {
      // Bit 7 of the first byte is basePid + 1, counting down.
      const isSet = (byte & (0x80 >> bit)) !== 0;
      if (isSet) supported.push(basePid + byteIndex * 8 + bit + 1);
    }
  }

  return supported;
}

/* -------------------------------------------------------------------------
 * Mode 03 / 07 — diagnostic trouble codes
 * ---------------------------------------------------------------------- */

const DTC_LETTERS = ['P', 'C', 'B', 'U'] as const;

/**
 * Decodes DTCs from a Mode 03 or 07 payload.
 *
 * Two bytes per code. The top two bits select the letter, the next two are the
 * first digit, and the remaining twelve bits are three hex digits.
 *
 * A pair of zero bytes is padding, not a code: ECUs return codes in fixed-size
 * blocks and fill the remainder with zeros. Emitting "P0000" for each would
 * invent faults out of empty space.
 */
export function decodeDtcs(bytes: readonly number[]): string[] {
  const codes: string[] = [];

  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const high = bytes[i]!;
    const low = bytes[i + 1]!;

    if (high === 0 && low === 0) continue;

    const letter = DTC_LETTERS[(high >> 6) & 0b11]!;
    const firstDigit = (high >> 4) & 0b11;
    const rest = ((high & 0x0f) << 8) | low;

    codes.push(`${letter}${firstDigit}${rest.toString(16).toUpperCase().padStart(3, '0')}`);
  }

  return codes;
}

/* -------------------------------------------------------------------------
 * Mode 09 — vehicle information
 * ---------------------------------------------------------------------- */

/**
 * Decodes a VIN from a Mode 09 PID 02 payload.
 *
 * Returns null unless exactly 17 printable characters result. A partial VIN is
 * worse than none: it would flow into the identification confidence score as
 * though it were evidence, and a 17-character string is the only thing that
 * can be checked against ISO 3779 (Rule 1).
 */
export function decodeVin(bytes: readonly number[]): string | null {
  const text = bytes
    .filter((byte) => byte >= 0x20 && byte <= 0x7e)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .trim();

  // Some ECUs pad the front with 0x00 and a message-count byte; those are
  // dropped above, leaving the VIN. Anything that is not 17 characters is
  // reported as unknown rather than trimmed into shape.
  return text.length === 17 ? text.toUpperCase() : null;
}
