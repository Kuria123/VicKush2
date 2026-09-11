import 'server-only';

import { prisma } from '@/lib/db/client';

/**
 * Phase 1 scope: the only vehicle read that exists. Its purpose is to prove a
 * real domain table round-trips against MySQL. The full vehicle service is
 * Stage 4.
 */
export async function countVehiclesForOwner(ownerId: string): Promise<number> {
  return prisma.vehicle.count({
    where: { ownerId, deletedAt: null },
  });
}
