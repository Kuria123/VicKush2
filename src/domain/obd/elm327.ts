/**
 * The ELM327 command set and response format.
 *
 * Pure string handling, and testable in full without an adapter. What makes it
 * worth testing carefully is that real adapter output is considerably messier
 * than the datasheet suggests: clones echo commands they were told not to,
 * insert spaces inconsistently, emit `SEARCHING...` mid-response, and split
 * long replies across lines with CAN frame numbering. Every one of those has
 * to be handled before a byte reaches a decoder.
 *
 * Nothing here talks to a device. A `Transport` does that, and is the only
 * part of real OBD support this build cannot verify.
 */

/** Terminates every ELM327 command. */
export const COMMAND_TERMINATOR = '\r';

/** The adapter prints this when it is ready for the next command. */
export const PROMPT = '>';

/**
 * The initialisation sequence, in order.
 *
 * Deliberately minimal, matching the brief's "begin with the smallest possible
 * capability set". Each command has a reason:
 *
 * - `ATZ`  — reset, so state from a previous session cannot leak in.
 * - `ATE0` — echo off. Without it every response is prefixed by the command
 *            that caused it, and a parser that strips it by position breaks
 *            the moment an adapter echoes differently.
 * - `ATL0` — no line feeds, so the terminator is predictable.
 * - `ATS0` — no spaces in responses; fewer bytes and less to normalise.
 * - `ATH1` — headers ON. This is the one that is not obvious: headers identify
 *            which ECU answered, and without them two modules responding to
 *            the same request are indistinguishable.
 * - `ATSP0`— automatic protocol search, so the adapter determines the protocol
 *            rather than this build assuming one.
 */
export const INIT_COMMANDS = ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0'] as const;

/** Responses that mean "no answer", not "an answer of zero". */
const NO_DATA_RESPONSES = [
  'NO DATA',
  'UNABLE TO CONNECT',
  'CAN ERROR',
  'BUS INIT: ERROR',
  'BUS ERROR',
  'DATA ERROR',
  'STOPPED',
  '?',
] as const;

/** Noise an adapter emits that is not part of any response. */
const NOISE_LINES = ['SEARCHING...', 'SEARCHING', 'BUS INIT:', 'BUS INIT'] as const;

export type Elm327Outcome =
  | { kind: 'DATA'; bytes: number[]; /** Responding ECU, when headers are on. */ header: string | null }
  | { kind: 'NO_DATA'; reason: string }
  | { kind: 'OK' }
  | { kind: 'UNPARSEABLE'; raw: string };

export function buildPidCommand(mode: number, pid: number): string {
  return `${hex2(mode)}${hex2(pid)}`;
}

/** Mode 03 and 07 take no PID. */
export function buildModeCommand(mode: number): string {
  return hex2(mode);
}

function hex2(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Interprets one complete adapter response.
 *
 * `expectedMode` is required rather than optional: a response is only valid if
 * it answers the mode that was asked. Without that check a late reply to a
 * previous command is decoded against the current one, which produces a
 * confident reading of the wrong parameter — the hardest class of bug to
 * notice, because every number looks reasonable.
 */
export function parseResponse(raw: string, expectedMode: number): Elm327Outcome {
  const cleaned = raw.replace(new RegExp(PROMPT, 'g'), '').trim();

  if (cleaned.length === 0) {
    return { kind: 'NO_DATA', reason: 'The adapter returned nothing.' };
  }

  const upper = cleaned.toUpperCase();

  for (const marker of NO_DATA_RESPONSES) {
    if (upper.includes(marker)) {
      return { kind: 'NO_DATA', reason: describeNoData(marker) };
    }
  }

  const lines = cleaned
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !NOISE_LINES.some((noise) => line.toUpperCase().startsWith(noise)));

  if (lines.length === 0) {
    return { kind: 'NO_DATA', reason: 'The adapter reported only a bus search.' };
  }

  if (lines.length === 1 && lines[0]!.toUpperCase() === 'OK') {
    return { kind: 'OK' };
  }

  const assembled = assemble(lines);
  if (!assembled) return { kind: 'UNPARSEABLE', raw: cleaned };

  const { bytes, header } = assembled;

  // A positive response adds 0x40 to the requested mode: 01 → 41, 03 → 43.
  const responseMode = expectedMode + 0x40;
  const modeIndex = bytes.indexOf(responseMode);

  if (modeIndex === -1) {
    // 0x7F is a negative response; the byte after it is the mode, then the
    // reason. Reported rather than swallowed (Rule 3).
    const negative = bytes.indexOf(0x7f);
    if (negative !== -1) {
      return {
        kind: 'NO_DATA',
        reason: `The ECU refused the request (negative response ${hex2(bytes[negative + 2] ?? 0)}).`,
      };
    }
    return { kind: 'UNPARSEABLE', raw: cleaned };
  }

  return { kind: 'DATA', bytes: bytes.slice(modeIndex), header };
}

/**
 * Joins the lines of a response into one byte sequence.
 *
 * Handles three shapes seen in practice:
 *
 * - A single line of hex.
 * - A header followed by hex on each line, when `ATH1` is on.
 * - An ISO-TP multi-frame reply, where the first line is a length and each
 *   subsequent line begins with a frame index. The indices are structural and
 *   are dropped; treating them as data shifts every byte that follows.
 */
function assemble(lines: readonly string[]): { bytes: number[]; header: string | null } | null {
  // Multi-frame: a line that is just a length, then lines starting "0:", "1:".
  const isMultiFrame = lines.some((line) => /^[0-9A-F]:/i.test(line));

  if (isMultiFrame) {
    const ordered = lines
      .filter((line) => /^[0-9A-F]:/i.test(line))
      .sort((a, b) => parseInt(a[0]!, 16) - parseInt(b[0]!, 16))
      .map((line) => line.slice(2));

    const bytes = hexBytes(ordered.join(''));
    return bytes ? { bytes, header: null } : null;
  }

  let header: string | null = null;
  const collected: number[] = [];

  for (const line of lines) {
    const compact = line.replace(/\s+/g, '');

    /*
     * An 11-bit CAN header is three hex digits — "7E8" — which makes the line
     * an odd number of characters. It has to come off before the rest can be
     * read as bytes at all, which is why this precedes the parse rather than
     * following it.
     *
     * What remains starts with the ISO-TP length byte, not with data. Keeping
     * it would shift every byte after it and decode the length as a mode.
     */
    if (/^7E[89A-F]/i.test(compact) && compact.length > 3) {
      const rest = hexBytes(compact.slice(3));
      if (rest && rest.length > 1) {
        if (header === null) header = compact.slice(0, 3).toUpperCase();
        collected.push(...rest.slice(1));
        continue;
      }
    }

    const bytes = hexBytes(compact);
    if (!bytes) continue;
    collected.push(...bytes);
  }

  return collected.length > 0 ? { bytes: collected, header } : null;
}

/** Parses a compact hex string, or null if it is not one. */
function hexBytes(text: string): number[] | null {
  const compact = text.replace(/\s+/g, '');
  if (compact.length === 0 || compact.length % 2 !== 0) return null;
  if (!/^[0-9A-Fa-f]+$/.test(compact)) return null;

  const bytes: number[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    bytes.push(parseInt(compact.slice(i, i + 2), 16));
  }
  return bytes;
}

function describeNoData(marker: string): string {
  switch (marker) {
    case 'NO DATA':
      return 'The ECU did not answer this request. The parameter is probably not supported.';
    case 'UNABLE TO CONNECT':
      return 'The adapter could not reach the vehicle. Check the ignition is on and the adapter is seated.';
    case 'CAN ERROR':
    case 'BUS ERROR':
    case 'BUS INIT: ERROR':
      return 'The adapter reported a bus error. This is a fault in the connection, not a reading.';
    case 'DATA ERROR':
      return 'The adapter reported corrupt data on the bus.';
    case 'STOPPED':
      return 'The request was interrupted before the ECU answered.';
    case '?':
      return 'The adapter did not recognise the command.';
    default:
      return `The adapter reported "${marker}".`;
  }
}

/**
 * Extracts the payload of a Mode 01 response, dropping mode and PID echo.
 *
 * A response to `010C` is `41 0C A B`. The PID is checked rather than assumed:
 * an adapter that answers a stale request would otherwise have its payload
 * decoded against whichever PID was asked most recently.
 */
export function modeOnePayload(bytes: readonly number[], expectedPid: number): number[] | null {
  if (bytes.length < 2) return null;
  if (bytes[0] !== 0x41) return null;
  if (bytes[1] !== expectedPid) return null;
  return [...bytes.slice(2)];
}

/** Mode 03/07/09 responses carry no PID echo for 03 and 07. */
export function modePayload(bytes: readonly number[], expectedMode: number): number[] | null {
  if (bytes.length < 1) return null;
  if (bytes[0] !== expectedMode + 0x40) return null;
  return [...bytes.slice(1)];
}
