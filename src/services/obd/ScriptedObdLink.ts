import type { ObdLink, ObdLinkDescriptor, ObdLinkResult } from '@/domain/telemetry';

/**
 * A link that answers from a script instead of from a vehicle.
 *
 * This is a test double, and it is in `src/` rather than beside the tests
 * because it is also what makes the real provider demonstrable: the same
 * `Elm327Provider` that would drive an adapter can be driven against recorded
 * responses, which is the only way to exercise the whole provider — connect,
 * negotiate, read, decode — without a car.
 *
 * It is emphatically **not** a simulator. It replays exact adapter strings and
 * models no vehicle behaviour: change the script and it says something else.
 * The physical model in `domain/simulation` is the simulator, and conflating
 * the two would be a way of quietly claiming this had been tested against
 * hardware.
 */

export interface ScriptedObdLinkOptions {
  /** Command (upper case, no terminator) → exact adapter response. */
  responses: Record<string, string>;
  /** Returned for any command not in the script. */
  fallback?: string;
  /** Simulates the API being unavailable in this environment. */
  available?: boolean;
}

export class ScriptedObdLink implements ObdLink {
  private readonly responses: Record<string, string>;
  private readonly fallback: string;
  private readonly available: boolean;
  private opened = false;

  /** Every command sent, in order. Lets a test assert the exchange itself. */
  readonly sent: string[] = [];

  constructor(options: ScriptedObdLinkOptions) {
    this.responses = options.responses;
    this.fallback = options.fallback ?? 'NO DATA\r>';
    this.available = options.available ?? true;
  }

  describe(): ObdLinkDescriptor {
    return {
      id: 'scripted',
      name: 'Scripted responses',
      kind: 'USB_SERIAL',
      // True in the sense that matters: this link is exactly what it claims,
      // and nothing about it is an untested guess at a hardware API.
      verifiedAgainstHardware: true,
      verificationNote: null,
    };
  }

  isAvailable(): boolean {
    return this.available;
  }

  async open(): Promise<ObdLinkResult<void>> {
    if (!this.available) {
      return {
        ok: false,
        error: { code: 'UNAVAILABLE', message: 'Scripted link marked unavailable.' },
      };
    }
    this.opened = true;
    return { ok: true, value: undefined };
  }

  async exchange(command: string): Promise<ObdLinkResult<string>> {
    if (!this.opened) {
      return {
        ok: false,
        error: { code: 'NOT_CONNECTED', message: 'The link is not open.' },
      };
    }

    this.sent.push(command);
    return { ok: true, value: this.responses[command.toUpperCase()] ?? this.fallback };
  }

  async close(): Promise<void> {
    this.opened = false;
  }
}

/**
 * A script for a healthy petrol engine at idle.
 *
 * The responses are the exact strings an ELM327 returns, spaces and all, so
 * the parser is exercised on the shape it will actually meet rather than on a
 * tidied version of it.
 */
export const IDLING_VEHICLE_SCRIPT: Record<string, string> = {
  ATZ: 'ELM327 v1.5\r\r>',
  ATE0: 'OK\r>',
  ATL0: 'OK\r>',
  ATS0: 'OK\r>',
  ATH1: 'OK\r>',
  ATSP0: 'OK\r>',
  ATDPN: 'A6\r>',

  // Supported PID bitmaps. The final bit of each says whether to ask again.
  '0100': '7E8 06 41 00 BE 3F A8 13\r>',
  '0120': '7E8 06 41 20 90 07 B0 11\r>',
  '0140': '7E8 06 41 40 FA DC A0 00\r>',

  // Live values at a warm idle.
  '010C': '7E8 04 41 0C 0B B8\r>', // 750 rpm
  '010D': '7E8 03 41 0D 00\r>', // stationary
  '0105': '7E8 03 41 05 7B\r>', // 83 °C
  '0111': '7E8 03 41 11 1A\r>', // ~10% throttle
  '0104': '7E8 03 41 04 42\r>', // ~26% load
  '0106': '7E8 03 41 06 82\r>', // +1.6% short trim
  '0107': '7E8 03 41 07 84\r>', // +3.1% long trim
  '0142': '7E8 04 41 42 36 B0\r>', // 14.0 V, charging

  // No stored or pending codes.
  '03': '7E8 02 43 00\r>',
  '07': '7E8 02 47 00\r>',

  // VIN, across multiple frames.
  '0902': [
    '7E8 10 14 49 02 01 31 4D 38',
    '7E8 21 47 44 4D 39 41 58 4B',
    '7E8 22 50 30 34 32 37 38 38',
  ].join('\r') + '\r>',
};
