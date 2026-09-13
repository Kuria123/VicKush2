import { describe, expect, it } from 'vitest';

import { ADAPTER_PROFILES, getProfile, selectableProfiles } from './profiles';
import {
  isOfferable,
  offerableCapabilities,
  resolveProfile,
  summarise,
  type ObservedCapabilities,
} from './resolve';
import { capabilityOf, HARDWARE_CAPABILITIES } from './types';

/**
 * Hardware compatibility.
 *
 * The brief's rule — "the UI must never imply that an unsupported capability
 * exists" — is what almost every test here is about, and the thing that makes
 * it non-trivial is that the brief's own example shows a tick-or-cross list. A
 * binary cannot express "not asked yet" without lying in one direction.
 */

const ELM = getProfile('elm327-usb-serial')!;

const observed = (overrides: Partial<ObservedCapabilities> = {}): ObservedCapabilities => ({
  supportedParameterIds: [],
  vinReturned: null,
  streaming: null,
  negotiated: true,
  ...overrides,
});

/* ---------------------------------------------------------------------------
 * The third state
 * ------------------------------------------------------------------------ */

describe('unknown is a state, not a placeholder', () => {
  it('leaves vehicle-dependent capabilities unknown before connecting', () => {
    // Whether a vehicle returns a VIN is a property of the vehicle. Marking it
    // supported because most do would be a guess about the reader's car;
    // marking it unsupported would be a definite negative nobody established.
    expect(capabilityOf(ELM, 'VIN').state).toBe('UNKNOWN');
    expect(capabilityOf(ELM, 'FUEL_TRIM').state).toBe('UNKNOWN');
  });

  it('treats a capability absent from a profile as unknown, never unsupported', () => {
    const sparse = { ...ELM, capabilities: [] };
    const entry = capabilityOf(sparse, 'ENGINE_RPM');

    expect(entry.state).toBe('UNKNOWN');
    expect(entry.reason).toMatch(/not the same as it being unavailable/i);
  });

  it('never offers an action for an unknown capability', () => {
    // A control that fails half the time teaches the user to distrust the
    // ones that work.
    expect(isOfferable(capabilityOf(ELM, 'VIN'))).toBe(false);
    expect(offerableCapabilities(ELM, ['VIN', 'ENGINE_RPM'])).toEqual(['ENGINE_RPM']);
  });

  it('counts the three states separately', () => {
    const summary = summarise(ELM);
    expect(summary.unknown).toBeGreaterThan(0);
    expect(summary.supported).toBeGreaterThan(0);
    expect(summary.notSupported).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------------
 * Observation beats declaration
 * ------------------------------------------------------------------------ */

describe('resolving against a live connection', () => {
  it('upgrades a capability the vehicle listed', () => {
    const resolved = resolveProfile(
      ELM,
      observed({ supportedParameterIds: ['SHORT_FUEL_TRIM_1', 'LONG_FUEL_TRIM_1'] }),
    );

    const trim = capabilityOf(resolved, 'FUEL_TRIM');
    expect(trim.state).toBe('SUPPORTED');
    expect(trim.evidence).toBe('OBSERVED');
  });

  it('downgrades a capability the vehicle did not list', () => {
    // The case the brief's rule is really about: a tick surviving on the
    // strength of a datasheet after the vehicle said no.
    const resolved = resolveProfile(ELM, observed({ supportedParameterIds: ['ENGINE_RPM'] }));

    const trim = capabilityOf(resolved, 'FUEL_TRIM');
    expect(trim.state).toBe('NOT_SUPPORTED');
    expect(trim.evidence).toBe('OBSERVED');
  });

  it('blames the vehicle rather than the adapter when it downgrades', () => {
    const resolved = resolveProfile(ELM, observed({ supportedParameterIds: [] }));

    // A reader whose adapter is fine should not be left thinking it is faulty.
    expect(capabilityOf(resolved, 'FUEL_TRIM').reason).toMatch(
      /not a fault in the adapter/i,
    );
    expect(capabilityOf(resolved, 'COOLANT_TEMP').reason).toMatch(
      /property of the vehicle/i,
    );
  });

  it('records a VIN that was returned, and one that was not', () => {
    expect(capabilityOf(resolveProfile(ELM, observed({ vinReturned: true })), 'VIN').state).toBe(
      'SUPPORTED',
    );

    const absent = capabilityOf(resolveProfile(ELM, observed({ vinReturned: false })), 'VIN');
    expect(absent.state).toBe('NOT_SUPPORTED');
    expect(absent.reason).toMatch(/Mode 09 is optional/i);
  });

  it('leaves the profile untouched before anything is negotiated', () => {
    // Guessing from an unconnected adapter would be worse than "not yet asked".
    const untouched = resolveProfile(ELM, observed({ negotiated: false }));
    expect(untouched).toBe(ELM);
  });

  it('never lets an observation overturn something ruled out', () => {
    // ABS is unreachable because of this build, not the vehicle. A connection
    // reporting anything cannot change that.
    const resolved = resolveProfile(
      ELM,
      observed({ supportedParameterIds: ['ABS', 'TRANSMISSION'] }),
    );

    expect(capabilityOf(resolved, 'ABS').state).toBe('NOT_SUPPORTED');
    expect(capabilityOf(resolved, 'ABS').evidence).toBe('RULED_OUT');
  });
});

/* ---------------------------------------------------------------------------
 * Honesty about the profiles themselves
 * ------------------------------------------------------------------------ */

describe('the profile catalogue', () => {
  it('names no commercial product', () => {
    // This project has tested no branded adapter, and a profile claiming to
    // describe one would be fabricated hardware data.
    for (const profile of ADAPTER_PROFILES) {
      expect(profile.name, profile.id).toMatch(/simulator|compatible|adapter/i);
      expect(profile.name, profile.id).not.toMatch(/\b(vgate|veepeak|autel|launch|obdlink|bafx)\b/i);
    }
  });

  it('declares which profiles have never been run against hardware', () => {
    expect(getProfile('elm327-usb-serial')!.verifiedAgainstHardware).toBe(false);
    expect(getProfile('elm327-bluetooth')!.verifiedAgainstHardware).toBe(false);
    expect(getProfile('wifi-obd')!.verifiedAgainstHardware).toBe(false);
  });

  it('says so in the notes as well as the flag', () => {
    expect(getProfile('elm327-usb-serial')!.notes.join(' ')).toMatch(
      /never been tested against a physical adapter/i,
    );
  });

  it('offers only the profiles a user can actually select', () => {
    const ids = selectableProfiles().map((p) => p.id);

    expect(ids).toContain('simulated');
    expect(ids).toContain('elm327-usb-serial');
    // No transport exists for these, and listing them as choices would imply
    // a capability that does not exist.
    expect(ids).not.toContain('elm327-bluetooth');
    expect(ids).not.toContain('wifi-obd');
  });

  it('explains every unavailable capability rather than showing a bare cross', () => {
    for (const profile of ADAPTER_PROFILES) {
      for (const entry of profile.capabilities) {
        expect(entry.reason.length, `${profile.id}/${entry.capability}`).toBeGreaterThan(30);
      }
    }
  });

  it('names what is missing when this build is the limitation', () => {
    const abs = capabilityOf(ELM, 'ABS');
    // Not "unsupported" with no explanation: the reader is told the limitation
    // is in this software rather than in their device.
    expect(abs.reason).toMatch(/limitation is in this software, not in your device/i);
  });

  it('gives the simulator no VIN, and says why', () => {
    const vin = capabilityOf(getProfile('simulated')!, 'VIN');

    expect(vin.state).toBe('NOT_SUPPORTED');
    expect(vin.reason).toMatch(/could collide with a real vehicle/i);
  });

  it('addresses every capability in the vocabulary for a selectable profile', () => {
    /*
     * A missing row resolves to unknown, which is safe but says nothing. An
     * explicit row saying "not established, and here is why" is better, and
     * NOT_ESTABLISHED is the correct evidence for a genuinely open question —
     * so what is asserted is presence, not the evidence value.
     */
    for (const profile of selectableProfiles()) {
      for (const capability of HARDWARE_CAPABILITIES) {
        const stated = profile.capabilities.some((entry) => entry.capability === capability);
        expect(stated, `${profile.id}/${capability}`).toBe(true);
      }
    }
  });
});
