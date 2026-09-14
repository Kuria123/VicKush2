import { API_VERSION, guard, handled } from '@/lib/api/guard';
import { buildReferralForVehicle } from '@/services/referral/service';

/**
 * The diagnostic report a mechanic receives.
 *
 * Exposed over HTTP rather than only rendered, because of where it has to go:
 * into a message, a print dialogue, or a garage's own system. A report that
 * can only be read inside this application has not reached the person it is
 * for.
 *
 * `concern` is the owner's own words and arrives from the client for that
 * reason. It is bounded and passed through unaltered — never rewritten,
 * summarised or supplied when absent, because the mechanic will read it as a
 * quotation.
 */

const MAX_CONCERN = 500;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const allowed = await guard({ rateLimit: 'read' });
  if (!allowed.ok) return allowed.response;

  const { id: vehicleId } = await context.params;
  const concern = new URL(request.url).searchParams.get('concern');

  if (concern !== null && concern.length > MAX_CONCERN) {
    return Response.json(
      { error: 'That description is too long to include.', version: API_VERSION },
      { status: 400 },
    );
  }

  return handled('api/v1/vehicles/referral', allowed.userId, async () => {
    const result = await buildReferralForVehicle({
      vehicleId,
      ownerId: allowed.userId,
      concern,
    });

    if (!result.ok) {
      return Response.json(
        { error: 'Vehicle not found.', version: API_VERSION },
        { status: 404 },
      );
    }

    /*
     * Both the structure and the rendered text. A client that wants to lay the
     * report out itself gets the fields; one that wants to hand it over
     * verbatim gets the exact text this build stands behind, rather than
     * reassembling it and possibly dropping the disclosures.
     */
    return Response.json(
      { report: result.report, text: result.text, version: API_VERSION },
      { headers: allowed.headers },
    );
  });
}
