import { describe, expect, it } from 'vitest';

import { formatDisplacement, formatEngine, formatVehicleName, formatVehicleSpec } from './display';
import type { VehicleIdentity } from './types';

const EMPTY: VehicleIdentity = { make: null, model: null, year: null, vin: null };

describe('formatVehicleName', () => {
  it('joins make and model', () => {
    expect(formatVehicleName({ ...EMPTY, make: 'Toyota', model: 'Harrier' })).toBe(
      'Toyota Harrier',
    );
  });

  it('uses whichever part is known', () => {
    expect(formatVehicleName({ ...EMPTY, make: 'Toyota' })).toBe('Toyota');
  });

  it('falls back to the VIN rather than inventing a name', () => {
    expect(formatVehicleName({ ...EMPTY, vin: '1M8GDM9AXKP042788' })).toBe('VIN 1M8GDM9AXKP042788');
  });

  it('says so plainly when nothing is known', () => {
    expect(formatVehicleName(EMPTY)).toBe('Unidentified vehicle');
  });
});

describe('formatDisplacement', () => {
  it('renders cc as the litre figure an engine is known by', () => {
    expect(formatDisplacement(1998)).toBe('2.0L');
    expect(formatDisplacement(2494)).toBe('2.5L');
    expect(formatDisplacement(660)).toBe('0.7L');
  });
});

describe('formatEngine', () => {
  it('combines displacement and fuel', () => {
    expect(formatEngine({ engineDisplacementCc: 1998, fuelType: 'PETROL' })).toBe('2.0L Petrol');
  });

  it('omits what is not known', () => {
    expect(formatEngine({ fuelType: 'DIESEL' })).toBe('Diesel');
    expect(formatEngine({ engineDisplacementCc: 1998 })).toBe('2.0L');
  });

  it('returns empty rather than a placeholder', () => {
    expect(formatEngine(null)).toBe('');
    expect(formatEngine({})).toBe('');
  });
});

describe('formatVehicleSpec', () => {
  it('builds the reference subtitle', () => {
    expect(
      formatVehicleSpec(
        { ...EMPTY, make: 'Toyota', model: 'Harrier', year: 2018 },
        { engineDisplacementCc: 1998, fuelType: 'PETROL', transmissionType: 'CVT' },
      ),
    ).toBe('2018 · 2.0L Petrol · CVT');
  });

  it('drops unknown segments instead of padding them', () => {
    expect(formatVehicleSpec({ ...EMPTY, year: 2018 }, { transmissionType: 'CVT' })).toBe(
      '2018 · CVT',
    );
  });

  it('returns empty when nothing is known', () => {
    expect(formatVehicleSpec(EMPTY, null)).toBe('');
  });
});
