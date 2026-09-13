import { capabilityOf } from './types';
import type {
  AdapterProfile,
  CapabilityEntry,
  HardwareCapability,
} from './types';

/**
 * Resolving a profile against what a live connection actually established.
 *
 * A profile is what a class of adapter is documented to do. An observation is
 * what this adapter, on this vehicle, was seen to do. When they disagree the
 * observation wins — it is evidence, and the profile is a description.
 *
 * The interesting direction is the one that looks like a downgrade: a
 * capability the profile lists as supported, which the vehicle did not report,
 * becomes NOT_SUPPORTED with the reason naming the vehicle rather than the
 * adapter. That is the case the brief's rule is really about. A table still
 * showing a tick after the vehicle said no would be implying a capability that
 * does not exist, on the strength of a datasheet.
 */

export interface ObservedCapabilities {
  /** Parameter ids the vehicle listed as supported. Empty before negotiation. */
  supportedParameterIds: readonly string[];
  /** Whether a VIN was actually returned. Null when not yet asked. */
  vinReturned: boolean | null;
  /** Whether the provider declared streaming after connecting. */
  streaming: boolean | null;
  /** True once a connection has been made and negotiation completed. */
  negotiated: boolean;
}

/** Which parameter ids satisfy each capability. */
const PARAMETERS_FOR: Partial<Record<HardwareCapability, readonly string[]>> = {
  ENGINE_RPM: ['ENGINE_RPM'],
  COOLANT_TEMP: ['COOLANT_TEMP'],
  FUEL_TRIM: ['SHORT_FUEL_TRIM_1', 'LONG_FUEL_TRIM_1'],
};

export function resolveProfile(
  profile: AdapterProfile,
  observed: ObservedCapabilities,
): AdapterProfile {
  // Nothing has been established, so the profile stands as written. Guessing
  // from an unconnected adapter would be worse than saying "not yet asked".
  if (!observed.negotiated) return profile;

  const capabilities = profile.capabilities.map((entry) =>
    resolveEntry(entry, observed),
  );

  return { ...profile, capabilities };
}

function resolveEntry(
  entry: CapabilityEntry,
  observed: ObservedCapabilities,
): CapabilityEntry {
  // A ruled-out capability is a limitation of this build, not of the vehicle.
  // Nothing a connection reports can change it.
  if (entry.evidence === 'RULED_OUT') return entry;

  const parameters = PARAMETERS_FOR[entry.capability];
  if (parameters) {
    const present = parameters.some((id) => observed.supportedParameterIds.includes(id));

    return present
      ? {
          ...entry,
          state: 'SUPPORTED',
          evidence: 'OBSERVED',
          reason: 'The vehicle listed this as supported when asked.',
        }
      : {
          ...entry,
          state: 'NOT_SUPPORTED',
          evidence: 'OBSERVED',
          // Names the vehicle, not the adapter. A reader whose adapter is fine
          // should not be left thinking it is faulty.
          reason:
            'The vehicle did not list this among the parameters it answers to. This is a property of the vehicle, not a fault in the adapter.',
        };
  }

  if (entry.capability === 'VIN' && observed.vinReturned !== null) {
    return observed.vinReturned
      ? {
          ...entry,
          state: 'SUPPORTED',
          evidence: 'OBSERVED',
          reason: 'The vehicle returned a complete VIN when asked.',
        }
      : {
          ...entry,
          state: 'NOT_SUPPORTED',
          evidence: 'OBSERVED',
          reason:
            'The vehicle did not return a usable VIN. Mode 09 is optional, and many vehicles do not implement it — this is not a fault in the adapter.',
        };
  }

  if (entry.capability === 'LIVE_STREAM' && observed.streaming !== null) {
    return observed.streaming
      ? { ...entry, state: 'SUPPORTED', evidence: 'OBSERVED', reason: entry.reason }
      : {
          ...entry,
          state: 'NOT_SUPPORTED',
          evidence: 'OBSERVED',
          reason: 'The provider did not offer streaming after connecting.',
        };
  }

  return entry;
}

/* -------------------------------------------------------------------------
 * Presentation helpers
 * ---------------------------------------------------------------------- */

/**
 * Whether a capability may be offered as an action in the UI.
 *
 * Only `SUPPORTED` qualifies. `UNKNOWN` must not: offering an action that
 * might not work is exactly what "the UI must never imply that an unsupported
 * capability exists" forbids, and a control that fails half the time teaches
 * the user to distrust the ones that work.
 */
export function isOfferable(entry: CapabilityEntry): boolean {
  return entry.state === 'SUPPORTED';
}

export function offerableCapabilities(
  profile: AdapterProfile,
  capabilities: readonly HardwareCapability[],
): HardwareCapability[] {
  return capabilities.filter((capability) => isOfferable(capabilityOf(profile, capability)));
}

export interface CapabilitySummary {
  supported: number;
  notSupported: number;
  unknown: number;
}

export function summarise(profile: AdapterProfile): CapabilitySummary {
  return profile.capabilities.reduce<CapabilitySummary>(
    (summary, entry) => {
      if (entry.state === 'SUPPORTED') summary.supported += 1;
      else if (entry.state === 'NOT_SUPPORTED') summary.notSupported += 1;
      else summary.unknown += 1;
      return summary;
    },
    { supported: 0, notSupported: 0, unknown: 0 },
  );
}
