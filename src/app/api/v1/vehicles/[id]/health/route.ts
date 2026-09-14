import { API_VERSION, guard, handled } from '@/lib/api/guard';
import { getVehicleHealth } from '@/services/health/service';
import { getPredictiveReport } from '@/services/prediction/service';
import { getVehicleForOwner } from '@/services/vehicle/queries';

/**
 * The Stage 16 health scores and the Stage 21 predictive signals.
 *
 * They are served together because they are read together: a score is a
 * statement about the latest scan and a signal is a direction across all of
 * them, and a reader shown one without the other draws the wrong conclusion
 * from whichever arrived first.
 *
 * Neither is computed here. Both engines are pure domain code and both
 * services already exist for the web pages; this route adds a transport and
 * nothing else. In particular the wording that keeps these honest — a score
 * carrying its deductions, `NOT_ASSESSED` for braking and suspension, and the
 * `notClaiming` line on every signal — travels in the response, because it is
 * part of the data rather than part of the page.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const allowed = await guard({ rateLimit: 'read' });
  if (!allowed.ok) return allowed.response;

  const { id: vehicleId } = await context.params;

  return handled('api/v1/vehicles/health', allowed.userId, async () => {
    const vehicle = await getVehicleForOwner(vehicleId, allowed.userId);
    if (!vehicle) {
      return Response.json(
        { error: 'Vehicle not found.', version: API_VERSION },
        { status: 404 },
      );
    }

    const [health, prediction] = await Promise.all([
      getVehicleHealth(vehicleId, allowed.userId),
      getPredictiveReport(vehicleId, allowed.userId),
    ]);

    return Response.json(
      { health, prediction, version: API_VERSION },
      { headers: allowed.headers },
    );
  });
}
