import { API_VERSION, guard, handled } from '@/lib/api/guard';
import { listVehiclesForOwner } from '@/services/vehicle/queries';

/**
 * The vehicles a signed-in user owns.
 *
 * This route exists for clients that cannot call a service directly. The web
 * app does not need it — its pages are server components and read the service
 * layer in-process, which is a round trip saved — but a mobile app has no such
 * option, and giving it a second implementation of the same query is exactly
 * the duplication the brief warns against.
 *
 * So the route is a thin adapter over `listVehiclesForOwner`, the same
 * function the pages use. Web and mobile share the query, the ownership
 * scoping and the shape; only the transport differs.
 */
export async function GET(): Promise<Response> {
  const allowed = await guard({ rateLimit: 'read' });
  if (!allowed.ok) return allowed.response;

  return handled('api/v1/vehicles', allowed.userId, async () => {
    const vehicles = await listVehiclesForOwner(allowed.userId);

    return Response.json(
      { vehicles, version: API_VERSION },
      { headers: allowed.headers },
    );
  });
}
