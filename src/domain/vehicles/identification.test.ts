import { describe, expect, it } from 'vitest';

import { EVIDENCE_WEIGHTS, SOURCE_TRUST, assessIdentification } from './identification';
import type { VehicleConfiguration, VehicleIdentity } from './types';

const VALID_VIN = '1M8GDM9AXKP042788';
/** Structurally valid, check digit deliberately wrong — the JDM-import case. */
const MISMATCHED_VIN = '1M8GDM9A0KP042788';

const EMPTY_IDENTITY: VehicleIdentity = {
  make: null,
  model: null,
  year: null,
  vin: null,
};

const HARRIER: VehicleIdentity = {
  make: 'Toyota',
  model: 'Harrier',
  year: 2018,
  vin: null,
};

const HARRIER_CONFIG: Partial<VehicleConfiguration> = {
  fuelType: 'PETROL',
  transmissionType: 'CVT',
  engineDisplacementCc: 1998,
};

describe('weights', () => {
  it('total 100, so a fully evidenced vehicle can reach full confidence', () => {
    const total = Object.values(EVIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('trusts an ECU reading above a typed one', () => {
    expect(SOURCE_TRUST.OBD_REPORTED).toBeGreaterThan(SOURCE_TRUST.USER_ENTERED);
  });
});

describe('status', () => {
  it('is UNIDENTIFIED when nothing is known', () => {
    const result = assessIdentification({
      identity: EMPTY_IDENTITY,
      source: 'USER_ENTERED',
    });
    expect(result.status).toBe('UNIDENTIFIED');
    expect(result.confidence).toBe(0);
  });

  it('is PARTIALLY_IDENTIFIED with only a make', () => {
    expect(
      assessIdentification({
        identity: { ...EMPTY_IDENTITY, make: 'Toyota' },
        source: 'USER_ENTERED',
      }).status,
    ).toBe('PARTIALLY_IDENTIFIED');
  });

  it('is PARTIALLY_IDENTIFIED for make/model/year alone', () => {
    // A brochure description, not a specific car.
    expect(assessIdentification({ identity: HARRIER, source: 'USER_ENTERED' }).status).toBe(
      'PARTIALLY_IDENTIFIED',
    );
  });

  it('is IDENTIFIED once the drivetrain is known', () => {
    expect(
      assessIdentification({
        identity: HARRIER,
        configuration: HARRIER_CONFIG,
        source: 'USER_ENTERED',
      }).status,
    ).toBe('IDENTIFIED');
  });

  it('is IDENTIFIED once a VIN pins the vehicle down', () => {
    expect(
      assessIdentification({
        identity: { ...HARRIER, vin: VALID_VIN },
        source: 'USER_ENTERED',
      }).status,
    ).toBe('IDENTIFIED');
  });

  it('is CONFLICTED regardless of how much is known', () => {
    const result = assessIdentification({
      identity: { ...HARRIER, vin: VALID_VIN },
      configuration: HARRIER_CONFIG,
      source: 'OBD_REPORTED',
      hasConflict: true,
    });
    expect(result.status).toBe('CONFLICTED');
    // Conflict changes the status, not the evidence already gathered.
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe('confidence', () => {
  it('is deterministic — identical evidence scores identically', () => {
    const input = {
      identity: HARRIER,
      configuration: HARRIER_CONFIG,
      source: 'USER_ENTERED',
    } as const;
    expect(assessIdentification(input).confidence).toBe(assessIdentification(input).confidence);
  });

  it('rises as evidence accumulates', () => {
    const sparse = assessIdentification({
      identity: { ...EMPTY_IDENTITY, make: 'Toyota' },
      source: 'USER_ENTERED',
    }).confidence;
    const richer = assessIdentification({
      identity: HARRIER,
      configuration: HARRIER_CONFIG,
      source: 'USER_ENTERED',
    }).confidence;

    expect(richer).toBeGreaterThan(sparse);
  });

  it('rates an ECU reading above the same facts typed in', () => {
    const typed = assessIdentification({
      identity: HARRIER,
      configuration: HARRIER_CONFIG,
      source: 'USER_ENTERED',
    }).confidence;
    const read = assessIdentification({
      identity: HARRIER,
      configuration: HARRIER_CONFIG,
      source: 'OBD_REPORTED',
    }).confidence;

    expect(read).toBeGreaterThan(typed);
  });

  it('reaches 100 only with complete, ECU-confirmed evidence', () => {
    const result = assessIdentification({
      identity: { ...HARRIER, vin: VALID_VIN },
      configuration: {
        ...HARRIER_CONFIG,
        engineCode: '3ZR-FAE',
        obdProtocol: 'ISO_15765_4_CAN_11B_500K',
        ecuName: 'Engine Control Module',
      },
      source: 'OBD_REPORTED',
    });
    expect(result.confidence).toBe(100);
    expect(result.gaps).toEqual([]);
  });

  it('never exceeds 100 or drops below 0', () => {
    const result = assessIdentification({
      identity: { ...HARRIER, vin: VALID_VIN },
      configuration: {
        ...HARRIER_CONFIG,
        engineCode: '3ZR-FAE',
        obdProtocol: 'ISO_15765_4_CAN_11B_500K',
        ecuName: 'ECM',
      },
      source: 'OBD_REPORTED',
    });
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it('scores a mismatched check digit below a matching one, but well above none', () => {
    const base = { identity: HARRIER, source: 'USER_ENTERED' } as const;

    const matching = assessIdentification({
      ...base,
      identity: { ...HARRIER, vin: VALID_VIN },
    }).confidence;
    const mismatched = assessIdentification({
      ...base,
      identity: { ...HARRIER, vin: MISMATCHED_VIN },
    }).confidence;
    const none = assessIdentification(base).confidence;

    expect(mismatched).toBeLessThan(matching);
    expect(mismatched).toBeGreaterThan(none);
  });

  it('awards nothing for a structurally invalid VIN', () => {
    const result = assessIdentification({
      identity: { ...HARRIER, vin: 'NOT-A-VIN' },
      source: 'USER_ENTERED',
    });
    expect(result.contributions.some((c) => c.field === 'vin')).toBe(false);
    expect(result.gaps).toContain('The recorded VIN is not structurally valid.');
  });
});

describe('explainability', () => {
  it('explains every point it awards', () => {
    const result = assessIdentification({
      identity: HARRIER,
      configuration: HARRIER_CONFIG,
      source: 'USER_ENTERED',
    });

    expect(result.contributions.length).toBeGreaterThan(0);
    for (const contribution of result.contributions) {
      expect(contribution.reason.length).toBeGreaterThan(0);
      expect(contribution.points).toBeGreaterThan(0);
    }
  });

  it('the contributions sum to the reported confidence', () => {
    const result = assessIdentification({
      identity: HARRIER,
      configuration: HARRIER_CONFIG,
      source: 'USER_ENTERED',
    });
    const sum = result.contributions.reduce((total, c) => total + c.points, 0);
    expect(result.confidence).toBe(sum);
  });

  it('names every gap when nothing is known', () => {
    const result = assessIdentification({
      identity: EMPTY_IDENTITY,
      source: 'UNKNOWN',
    });
    expect(result.gaps).toContain('Make is not known.');
    expect(result.gaps).toContain('No VIN recorded.');
    expect(result.gaps).toContain('ECU has not been read.');
  });

  it('flags a mismatched check digit as a gap the user should see', () => {
    const result = assessIdentification({
      identity: { ...HARRIER, vin: MISMATCHED_VIN },
      source: 'USER_ENTERED',
    });
    expect(result.gaps.some((g) => g.includes('check digit'))).toBe(true);
  });
});
