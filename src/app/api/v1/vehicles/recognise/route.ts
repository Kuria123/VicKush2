import { interpretRecognition, type RecognitionImage } from '@/domain/recognition';
import { API_VERSION, guard, handled } from '@/lib/api/guard';
import { recordAuditAsync } from '@/services/audit/audit';
import { resolveRecognitionProvider } from '@/services/recognition/registry';

/**
 * Examines photographs of a vehicle and proposes what it is.
 *
 * Nothing here writes to the database. The route returns proposals; the owner
 * confirms or corrects them and then saves through the ordinary vehicle form,
 * which runs the same validation it always did. That separation is the whole
 * design — recognition fills in a form, it does not create a record.
 *
 * Server-side because the API key is, and because the images are photographs
 * of the user's own vehicle and their registration plate.
 */

/**
 * Roughly 4 MB of image data once base64 is accounted for.
 *
 * Bounded because an unbounded upload endpoint is a way to fill a disk and a
 * way to spend somebody else's token budget. The client downscales before
 * sending, so a legitimate request is far below this.
 */
const MAX_BYTES = 6 * 1024 * 1024;

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export async function POST(request: Request): Promise<Response> {
  const allowed = await guard({ rateLimit: 'ai-explain', auditOnLimit: 'RATE_LIMITED' });
  if (!allowed.ok) return allowed.response;

  const userId = allowed.userId;

  return handled('api/v1/vehicles/recognise', userId, async () => {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BYTES) {
      return Response.json(
        { error: 'Those images are too large. Try fewer, or smaller ones.', version: API_VERSION },
        { status: 413 },
      );
    }

    let payload: { images?: unknown };
    try {
      payload = JSON.parse(rawBody) as { images?: unknown };
    } catch {
      return Response.json({ error: 'Expected a JSON body.', version: API_VERSION }, { status: 400 });
    }

    const images = readImages(payload.images);
    if (images === null) {
      return Response.json(
        { error: 'Expected one or more base64 images.', version: API_VERSION },
        { status: 400 },
      );
    }

    const provider = resolveRecognitionProvider();
    const outcome = await provider.recognise(images);

    if (!outcome.ok) {
      /*
       * Reported with its reason rather than flattened into a generic failure.
       * "No vision model is configured" and "the photograph was unreadable"
       * ask completely different things of the person reading the screen
       * (Rule 3).
       */
      return Response.json(
        {
          error: outcome.message,
          reason: outcome.reason,
          provider: provider.describe(),
          version: API_VERSION,
        },
        { status: outcome.reason === 'NOT_CONFIGURED' ? 501 : 502, headers: allowed.headers },
      );
    }

    // Everything the model claimed now has to survive the interpreter.
    const result = interpretRecognition(outcome.raw);

    recordAuditAsync({
      action: 'VEHICLE_RECOGNISED',
      userId,
      detail: `Recognition over ${images.length} image(s), ${result.rejected.length} claim(s) rejected`,
    });

    return Response.json(
      { result, model: outcome.model, version: API_VERSION },
      { headers: allowed.headers },
    );
  });
}

/** Shape-checks the upload. A payload that is not images is not truncated into some. */
function readImages(value: unknown): RecognitionImage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const images: RecognitionImage[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const record = item as Record<string, unknown>;

    const base64 = record.base64;
    const mediaType = record.mediaType;
    if (typeof base64 !== 'string' || base64.length === 0) return null;
    if (typeof mediaType !== 'string') return null;
    if (!(MEDIA_TYPES as readonly string[]).includes(mediaType)) return null;

    const atSeconds = record.atSeconds;
    images.push({
      base64,
      mediaType: mediaType as RecognitionImage['mediaType'],
      origin:
        typeof atSeconds === 'number' && Number.isFinite(atSeconds)
          ? { kind: 'VIDEO_FRAME', atSeconds }
          : { kind: 'PHOTO' },
    });
  }

  return images;
}
