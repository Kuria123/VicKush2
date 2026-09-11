import { z } from 'zod';

import {
  DRIVE_TYPES,
  FUEL_TYPES,
  IDENTIFICATION_SOURCES,
  MODULE_STATUSES,
  MODULE_SYSTEMS,
  OBD_PROTOCOLS,
  TRANSMISSION_TYPES,
  VIN_ISSUE_MESSAGES,
  assessVin,
  normalizeVin,
} from '@/domain/vehicles';

/**
 * Boundary validation for vehicle input.
 *
 * Optional fields normalise empty strings to `null` rather than `''`, so
 * "not provided" stays distinguishable from "provided as blank" all the way
 * into the database.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/**
 * Enforces structural validity only. A failing check digit is reported as
 * reduced confidence, never as a rejected VIN — see src/domain/vehicles/vin.ts.
 */
export const vinSchema = z
  .string()
  .trim()
  .transform(normalizeVin)
  .superRefine((value, ctx) => {
    if (value === '') return;
    const assessment = assessVin(value);
    if (assessment.isStructurallyValid) return;

    const issue = assessment.issues[0];
    ctx.addIssue({
      code: 'custom',
      message: issue ? VIN_ISSUE_MESSAGES[issue] : 'Enter a valid VIN.',
    });
  })
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const CURRENT_YEAR = new Date().getUTCFullYear();

export const yearSchema = z
  .number()
  .int()
  .min(1900, 'Year must be 1900 or later.')
  // One year ahead: model years are released before the calendar year turns.
  .max(CURRENT_YEAR + 1, `Year cannot be later than ${CURRENT_YEAR + 1}.`)
  .nullable()
  .optional();

export const vehicleIdentitySchema = z.object({
  displayName: optionalText(80),
  make: optionalText(64),
  model: optionalText(64),
  year: yearSchema,
  vin: vinSchema,
});

export const vehicleConfigurationSchema = z.object({
  engineCode: optionalText(32),
  engineDisplacementCc: z
    .number()
    .int()
    .min(50, 'Displacement must be at least 50 cc.')
    .max(32000, 'Displacement must be at most 32000 cc.')
    .nullable()
    .optional(),
  engineCylinders: z.number().int().min(1).max(16).nullable().optional(),
  fuelType: z.enum(FUEL_TYPES).nullable().optional(),
  transmissionType: z.enum(TRANSMISSION_TYPES).nullable().optional(),
  transmissionGears: z.number().int().min(1).max(12).nullable().optional(),
  driveType: z.enum(DRIVE_TYPES).nullable().optional(),
  ecuName: optionalText(64),
  obdProtocol: z.enum(OBD_PROTOCOLS).nullable().optional(),
  supportsObd2: z.boolean().nullable().optional(),
  source: z.enum(IDENTIFICATION_SOURCES).default('USER_ENTERED'),
});

export const vehicleModuleSchema = z.object({
  name: z.string().trim().min(1, 'Module name is required.').max(64),
  system: z.enum(MODULE_SYSTEMS).default('OTHER'),
  address: z
    .string()
    .trim()
    .regex(/^[0-9A-Fa-f]{1,8}$/, 'Address must be hexadecimal.')
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  protocol: z.enum(OBD_PROTOCOLS).nullable().optional(),
  status: z.enum(MODULE_STATUSES).default('UNKNOWN'),
});

/** A vehicle needs at least one identifying detail to be worth creating. */
export const createVehicleSchema = vehicleIdentitySchema
  .extend({
    configuration: vehicleConfigurationSchema.partial().optional(),
    source: z.enum(IDENTIFICATION_SOURCES).default('USER_ENTERED'),
  })
  .refine((value) => Boolean(value.make || value.model || value.vin || value.displayName), {
    message: 'Provide at least a make, model, VIN or name.',
    path: ['make'],
  });

export const updateVehicleSchema = vehicleIdentitySchema.extend({
  isPrimary: z.boolean().optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleConfigurationInput = z.infer<typeof vehicleConfigurationSchema>;
export type VehicleModuleInput = z.infer<typeof vehicleModuleSchema>;
