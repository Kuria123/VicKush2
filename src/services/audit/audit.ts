import { prisma } from '@/lib/db/client';
import { reportError } from '@/lib/logging/monitoring';

/**
 * Recording actions worth being able to reconstruct.
 *
 * Two properties matter.
 *
 * **Writing an audit entry must never fail the action it describes.** If the
 * audit table is unreachable, clearing a fault code should still work — an
 * audit log that can take down the operation it observes is a liability, not a
 * safeguard. The failure is reported rather than swallowed, so it is visible
 * without being fatal (Rule 3).
 *
 * **No payloads.** `detail` is a short summary, never a request body. A log
 * that carries the data it describes doubles the surface area of a breach for
 * no benefit, and this one would otherwise end up holding vehicle telemetry.
 */

export type AuditAction =
  | 'VEHICLE_CREATED'
  | 'VEHICLE_UPDATED'
  | 'VEHICLE_DELETED'
  | 'SESSION_SAVED'
  | 'DTCS_CLEARED'
  | 'REPAIR_RECORDED'
  | 'REPAIR_VERIFIED'
  | 'QUOTE_RECORDED'
  | 'AI_EXPLANATION_REQUESTED'
  | 'AI_MECHANIC_REQUESTED'
  | 'RATE_LIMITED';

export interface AuditInput {
  action: AuditAction;
  userId?: string | null;
  vehicleId?: string | null;
  /** One line. Truncated rather than rejected: losing the entry is worse. */
  detail?: string | null;
  /** A refused action is worth recording too. */
  succeeded?: boolean;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        vehicleId: input.vehicleId ?? null,
        detail: input.detail?.slice(0, 300) ?? null,
        succeeded: input.succeeded ?? true,
      },
    });
  } catch (error) {
    // Visible, but never fatal to the caller.
    reportError({
      scope: 'audit',
      error,
      userId: input.userId ?? null,
      context: { action: input.action },
    });
  }
}

/**
 * Fire-and-forget, for call sites where awaiting would add latency to a user
 * action for no benefit.
 *
 * The promise is still handled — an unhandled rejection would crash the
 * process in Node, which is the opposite of the guarantee above.
 */
export function recordAuditAsync(input: AuditInput): void {
  void recordAudit(input);
}

export interface AuditQuery {
  userId: string;
  vehicleId?: string;
  limit?: number;
}

/**
 * Reads a user's own audit trail.
 *
 * Scoped by userId in the query, like every other read in this codebase. An
 * audit log that could be read across accounts would be a considerably worse
 * leak than the data it protects.
 */
export async function listAuditEvents(query: AuditQuery) {
  return prisma.auditEvent.findMany({
    where: {
      userId: query.userId,
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
    },
    orderBy: { occurredAt: 'desc' },
    take: query.limit ?? 100,
    select: {
      id: true,
      action: true,
      vehicleId: true,
      detail: true,
      succeeded: true,
      occurredAt: true,
    },
  });
}
