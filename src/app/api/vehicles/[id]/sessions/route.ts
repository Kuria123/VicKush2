import { currentUserId } from '@/lib/auth';
import { saveDiagnosticSession } from '@/services/diagnostics/persistence';

/**
 * Records a finished diagnosis against a vehicle.
 *
 * The session lives in the browser, so the client posts what it holds. Two
 * consequences follow, and both are handled rather than assumed away:
 *
 * - **Ownership is checked in the service, inside the query.** A vehicle id
 *   arriving from a client is a claim, not a fact.
 * - **The payload is bounded.** A summarised session is a few tens of
 *   kilobytes; anything far larger is not one.
 */

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: 'Not signed in.' }, { status: 401 });

  const { id: vehicleId } = await context.params;

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    return Response.json({ error: 'That session is too large to store.' }, { status: 413 });
  }

  let payload: SavePayload;
  try {
    payload = JSON.parse(raw) as SavePayload;
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (!payload.analysis || !payload.differential) {
    return Response.json({ error: 'A completed diagnosis is required.' }, { status: 400 });
  }

  const result = await saveDiagnosticSession({
    vehicleId,
    ownerId: userId,
    analysis: payload.analysis,
    differential: payload.differential,
    results: payload.results ?? [],
    providerName: payload.providerName ?? 'Unknown provider',
    isSimulated: Boolean(payload.isSimulated),
    scenario: payload.scenario ?? null,
    startedAt: new Date(payload.startedAt ?? Date.now()),
    durationMs: payload.durationMs ?? 0,
    parameterStats: payload.parameterStats ?? [],
    dtcs: (payload.dtcs ?? []).map((dtc) => ({
      code: dtc.code,
      status: dtc.status,
      moduleAddress: dtc.moduleAddress ?? null,
      firstSeenAt: new Date(dtc.firstSeenAt),
    })),
  });

  if (!result.ok) {
    // Rule 3: the reason is reported, not flattened into a generic failure.
    return Response.json(
      {
        error:
          result.reason === 'EMPTY_SESSION'
            ? 'That session recorded no samples, so there is nothing to store.'
            : 'Vehicle not found.',
        reason: result.reason,
      },
      { status: result.reason === 'EMPTY_SESSION' ? 400 : 404 },
    );
  }

  return Response.json({ sessionId: result.sessionId }, { status: 201 });
}

/* The client sends the domain objects as JSON; the service re-reads only the
 * fields it needs, so a malformed extra key cannot reach the database. */
interface SavePayload {
  analysis: Parameters<typeof saveDiagnosticSession>[0]['analysis'];
  differential: Parameters<typeof saveDiagnosticSession>[0]['differential'];
  results?: Parameters<typeof saveDiagnosticSession>[0]['results'];
  providerName?: string;
  isSimulated?: boolean;
  scenario?: string | null;
  startedAt?: number;
  durationMs?: number;
  parameterStats?: Parameters<typeof saveDiagnosticSession>[0]['parameterStats'];
  dtcs?: {
    code: string;
    status: 'STORED' | 'PENDING' | 'PERMANENT';
    moduleAddress?: string | null;
    firstSeenAt: number;
  }[];
}
