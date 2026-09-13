/**
 * Hardware capability profiles.
 *
 * The brief's rule is "the UI must never imply that an unsupported capability
 * exists", and its example shows a tick-or-cross list. Those two things are in
 * tension, and resolving it is the whole design of this file.
 *
 * A cross means "this device cannot do that". Before a device has been
 * connected and asked, nobody knows whether it can — so rendering a cross
 * would be a definite negative nobody established. The binary has to become
 * three states:
 *
 *   SUPPORTED     — established that it can
 *   NOT_SUPPORTED — established that it cannot
 *   UNKNOWN       — not established either way
 *
 * `UNKNOWN` is not a placeholder for one of the other two. It is the honest
 * state of most capabilities most of the time, and collapsing it into a cross
 * to make the table look decisive would break the brief's rule in the
 * direction people notice least.
 *
 * The second distinction that matters is *how* a capability came to be known.
 * A datasheet saying an adapter supports something is weaker evidence than the
 * vehicle having actually answered, and the two must not be presented
 * identically.
 */

export const CAPABILITY_STATES = ['SUPPORTED', 'NOT_SUPPORTED', 'UNKNOWN'] as const;
export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export const CAPABILITY_EVIDENCE = [
  /** Required of every OBD-II vehicle by legislation. The strongest claim. */
  'REQUIRED_BY_STANDARD',
  /** Seen to work on this connection, with this vehicle. */
  'OBSERVED',
  /** Stated by the adapter's published specification. Not yet seen. */
  'DECLARED_BY_PROFILE',
  /** Established that it cannot, because something specific is missing. */
  'RULED_OUT',
  /** Nothing has established it either way. */
  'NOT_ESTABLISHED',
] as const;
export type CapabilityEvidence = (typeof CAPABILITY_EVIDENCE)[number];

/**
 * The capabilities a user would ask about.
 *
 * Deliberately the brief's own vocabulary rather than the internal provider
 * capability names — this is the list a person reads before buying an adapter,
 * and it should use the words they would use.
 */
export const HARDWARE_CAPABILITIES = [
  'VIN',
  'DTC_READ',
  'DTC_CLEAR',
  'ENGINE_RPM',
  'COOLANT_TEMP',
  'FUEL_TRIM',
  'LIVE_STREAM',
  'ABS',
  'TRANSMISSION',
  'MISFIRE_COUNTS',
] as const;
export type HardwareCapability = (typeof HARDWARE_CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<HardwareCapability, string> = {
  VIN: 'Vehicle identification number',
  DTC_READ: 'Read fault codes',
  DTC_CLEAR: 'Clear fault codes',
  ENGINE_RPM: 'Engine speed',
  COOLANT_TEMP: 'Coolant temperature',
  FUEL_TRIM: 'Fuel trims',
  LIVE_STREAM: 'Continuous live data',
  ABS: 'ABS module data',
  TRANSMISSION: 'Transmission module data',
  MISFIRE_COUNTS: 'Misfire counters',
};

export interface CapabilityEntry {
  capability: HardwareCapability;
  state: CapabilityState;
  evidence: CapabilityEvidence;
  /**
   * Why it is in this state, in plain language.
   *
   * Required, not optional. A cross with no explanation invites the reader to
   * assume a fault in their adapter when the limitation may be in this build,
   * in the vehicle, or in the standard.
   */
  reason: string;
}

export const CONNECTION_KINDS = ['BLUETOOTH', 'USB_SERIAL', 'WIFI', 'SIMULATED'] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export const CONNECTION_LABELS: Record<ConnectionKind, string> = {
  BLUETOOTH: 'Bluetooth',
  USB_SERIAL: 'USB or serial',
  WIFI: 'Wi-Fi',
  SIMULATED: 'Simulated',
};

/**
 * What is known about a class of adapter before connecting to one.
 *
 * Profiles describe *classes* — "an ELM327 v1.5 clone" — not named commercial
 * products. This build has tested no branded device, and a profile claiming to
 * describe one would be fabricated hardware data (Rule 1).
 */
export interface AdapterProfile {
  id: string;
  name: string;
  connection: ConnectionKind;
  /**
   * Protocols the class is documented to speak. Never a claim that a
   * particular vehicle uses one of them.
   */
  protocols: readonly string[];
  capabilities: readonly CapabilityEntry[];
  /**
   * Whether this project has ever run this profile against real hardware.
   *
   * The same declaration the link descriptor carries, repeated here because
   * this is where a user compares adapters and would otherwise assume every
   * row was equally well established.
   */
  verifiedAgainstHardware: boolean;
  notes: readonly string[];
}

export function capabilityOf(
  profile: AdapterProfile,
  capability: HardwareCapability,
): CapabilityEntry {
  const found = profile.capabilities.find((entry) => entry.capability === capability);

  // A capability absent from a profile is unknown, never unsupported. Omission
  // is not evidence.
  return (
    found ?? {
      capability,
      state: 'UNKNOWN',
      evidence: 'NOT_ESTABLISHED',
      reason: 'This profile says nothing about it, which is not the same as it being unavailable.',
    }
  );
}
