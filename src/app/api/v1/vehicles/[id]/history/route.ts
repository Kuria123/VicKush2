import { API_VERSION, guard, handled } from '@/lib/api/guard';
import { listMaintenance, listTimeline } from '@/services/diagnostics/history';
import { getVehicleForOwner } from '@/services/vehicle/queries';

/**
 * A vehicle's recorded history: the timeline, plus the maintenance its owner
 * entered.
 *
 * Both come from the Stage 15 service layer unchanged, so the rules that
 * govern the web timeline govern this response too — ownership inside the
 * query, newest first, and nothing inferred or projected into a row.
 *
 * The 404 is deliberate rather than an empty list. Every query here is scoped
 * by owner, so a vehicle belonging to somebody else and a vehicle with no
 * history would both return `[]`, and a mobile client would render "no history
 * recorded" for a car it cannot see. Asking for the vehicle first makes the two
 * answers different, which they are.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const allowed = await guard({ rateLimit: 'read' });
  if (!allowed.ok) return allowed.response;

  const { id: vehicleId } = await context.params;

  return handled('api/v1/vehicles/history', allowed.userId, async () => {
    const vehicle = await getVehicleForOwner(vehicleId, allowed.userId);
    if (!vehicle) {
      return Response.json(
        { error: 'Vehicle not found.', version: API_VERSION },
        { status: 404 },
      );
    }

    const [timeline, maintenance] = await Promise.all([
      listTimeline(vehicleId, allowed.userId),
      listMaintenance(vehicleId, allowed.userId),
    ]);

    return Response.json(
      { timeline, maintenance, version: API_VERSION },
      { headers: allowed.headers },
    );
  });
}
