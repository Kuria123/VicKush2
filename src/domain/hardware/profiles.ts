import type { AdapterProfile, CapabilityEntry } from './types';

/**
 * The adapter profiles this build knows about.
 *
 * Every one describes a *class* of device — "an ELM327-compatible adapter over
 * USB" — and none names a commercial product. This project has tested no
 * branded adapter, and a profile claiming to describe one would be fabricated
 * hardware data of exactly the kind the rules forbid. A table of plausible
 * device names would also be the single most useful-looking and least
 * trustworthy thing in the product.
 *
 * What these profiles rest on instead is the ELM327 datasheet and ISO 15031 /
 * SAE J1979, both public. Where a capability depends on the vehicle rather
 * than the adapter, the profile says so and leaves the state unknown until a
 * connection establishes it.
 */

/* --- Shared entries ------------------------------------------------------- */

const MANDATORY_MODES: CapabilityEntry[] = [
  {
    capability: 'DTC_READ',
    state: 'SUPPORTED',
    evidence: 'REQUIRED_BY_STANDARD',
    reason:
      'Mode 03 is mandatory on every OBD-II vehicle, so any compliant adapter can request it.',
  },
  {
    capability: 'DTC_CLEAR',
    state: 'SUPPORTED',
    evidence: 'REQUIRED_BY_STANDARD',
    reason: 'Mode 04 is mandatory on every OBD-II vehicle.',
  },
  {
    capability: 'ENGINE_RPM',
    state: 'SUPPORTED',
    evidence: 'REQUIRED_BY_STANDARD',
    reason:
      'PID 0C is in the minimum set every OBD-II vehicle must answer, so support does not depend on the adapter.',
  },
  {
    capability: 'COOLANT_TEMP',
    state: 'SUPPORTED',
    evidence: 'REQUIRED_BY_STANDARD',
    reason: 'PID 05 is in the minimum required set.',
  },
];

/**
 * Capabilities the vehicle decides, not the adapter.
 *
 * Left unknown until a connection settles them. Marking them supported because
 * most vehicles offer them would be a guess about the reader's car.
 */
const VEHICLE_DEPENDENT: CapabilityEntry[] = [
  {
    capability: 'VIN',
    state: 'UNKNOWN',
    evidence: 'NOT_ESTABLISHED',
    reason:
      'Mode 09 is optional. Whether your vehicle returns a VIN is a property of the vehicle, not of the adapter, and is only known once asked.',
  },
  {
    capability: 'FUEL_TRIM',
    state: 'UNKNOWN',
    evidence: 'NOT_ESTABLISHED',
    reason:
      'PIDs 06 and 07 are optional. Most petrol engines report them; diesels commonly do not. The vehicle states which it supports on connection.',
  },
];

/**
 * Capabilities this build cannot reach, whatever the adapter can do.
 *
 * `RULED_OUT` rather than unknown: these are established negatives, and the
 * reason names what is actually missing so a reader does not conclude their
 * adapter is at fault.
 */
const OUT_OF_SCOPE: CapabilityEntry[] = [
  {
    capability: 'ABS',
    state: 'NOT_SUPPORTED',
    evidence: 'RULED_OUT',
    reason:
      'ABS data sits outside the legislated OBD-II range and needs manufacturer-specific addressing. This build has no table for it, so no adapter can reach it here — the limitation is in this software, not in your device.',
  },
  {
    capability: 'TRANSMISSION',
    state: 'NOT_SUPPORTED',
    evidence: 'RULED_OUT',
    reason:
      'Transmission module data needs manufacturer-specific addressing that this build does not have. The same limitation as ABS, and for the same reason.',
  },
  {
    capability: 'MISFIRE_COUNTS',
    state: 'NOT_SUPPORTED',
    evidence: 'RULED_OUT',
    reason:
      'Misfire counters are Mode 06 on-board monitoring results, which this build does not read. An adapter that supports Mode 06 still cannot help until this software asks for it.',
  },
];

const LIVE_STREAM_ELM327: CapabilityEntry = {
  capability: 'LIVE_STREAM',
  state: 'SUPPORTED',
  evidence: 'DECLARED_BY_PROFILE',
  reason:
    'An ELM327 answers one request at a time, so a stream is a polling loop. It works, but the achievable rate falls as more parameters are requested, and the provider reports the rate it actually reaches rather than the one asked for.',
};

/* --- The profiles --------------------------------------------------------- */

export const ADAPTER_PROFILES: readonly AdapterProfile[] = [
  {
    id: 'simulated',
    name: 'Built-in vehicle simulator',
    connection: 'SIMULATED',
    protocols: ['ISO 15765-4 (CAN 11-bit, 500 kbit/s) — reported by the simulation'],
    capabilities: [
      ...MANDATORY_MODES,
      {
        capability: 'VIN',
        state: 'NOT_SUPPORTED',
        evidence: 'RULED_OUT',
        reason:
          'The simulator deliberately reports no VIN. A fabricated 17-character string could collide with a real vehicle and would reach the identification score as though it were evidence.',
      },
      {
        capability: 'FUEL_TRIM',
        state: 'SUPPORTED',
        evidence: 'OBSERVED',
        reason: 'The physical model computes closed-loop fuel trims, and the tests read them.',
      },
      {
        capability: 'LIVE_STREAM',
        state: 'SUPPORTED',
        evidence: 'OBSERVED',
        reason: 'Streams at the requested rate; there is no bus to wait for.',
      },
      ...OUT_OF_SCOPE,
    ],
    // Not hardware at all, so the question does not arise in the usual sense:
    // what it does is exactly what its tests exercise.
    verifiedAgainstHardware: true,
    notes: [
      'Not a device. Every reading is produced by a physical model and is labelled SIMULATION MODE wherever it appears.',
    ],
  },

  {
    id: 'elm327-usb-serial',
    name: 'ELM327-compatible adapter (USB or serial)',
    connection: 'USB_SERIAL',
    protocols: [
      'Determined automatically by the adapter (ATSP0)',
      'ISO 15765-4 CAN, ISO 14230-4 KWP, ISO 9141-2, SAE J1850 — as the class documents',
    ],
    capabilities: [...MANDATORY_MODES, ...VEHICLE_DEPENDENT, LIVE_STREAM_ELM327, ...OUT_OF_SCOPE],
    // The protocol above the link is tested; the link itself has never been
    // run against a device.
    verifiedAgainstHardware: false,
    notes: [
      'This connection has never been tested against a physical adapter by this project. The protocol, decoding and capability negotiation above it are fully tested; the transport layer is not.',
      'Clone adapters vary. Some ignore commands they claim to accept, some report a firmware version they do not implement, and a capability listed here as supported may still fail on a particular device.',
      'Whether your vehicle supports a given reading is settled on connection, by asking it, rather than assumed from this table.',
    ],
  },

  {
    id: 'elm327-bluetooth',
    name: 'ELM327-compatible adapter (Bluetooth)',
    connection: 'BLUETOOTH',
    protocols: ['Determined automatically by the adapter (ATSP0)'],
    capabilities: [...MANDATORY_MODES, ...VEHICLE_DEPENDENT, LIVE_STREAM_ELM327, ...OUT_OF_SCOPE],
    verifiedAgainstHardware: false,
    notes: [
      'No Bluetooth transport is implemented in this build yet, so this profile describes what such an adapter does rather than something you can currently select.',
      'Bluetooth adapters add latency over a serial connection, which lowers the achievable sample rate further.',
    ],
  },

  {
    id: 'wifi-obd',
    name: 'Wi-Fi OBD adapter',
    connection: 'WIFI',
    protocols: ['Determined automatically by the adapter'],
    capabilities: [...MANDATORY_MODES, ...VEHICLE_DEPENDENT, LIVE_STREAM_ELM327, ...OUT_OF_SCOPE],
    verifiedAgainstHardware: false,
    notes: [
      'No Wi-Fi transport is implemented in this build. A browser cannot open a raw TCP socket, so one would need a local bridge — which is why this profile exists as a description rather than an option.',
    ],
  },
];

export function getProfile(id: string): AdapterProfile | undefined {
  return ADAPTER_PROFILES.find((profile) => profile.id === id);
}

/** Profiles a user can actually select right now. */
export function selectableProfiles(): AdapterProfile[] {
  return ADAPTER_PROFILES.filter(
    (profile) => profile.id === 'simulated' || profile.id === 'elm327-usb-serial',
  );
}
