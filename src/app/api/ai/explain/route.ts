import { resolveAIProvider } from '@/services/ai/registry';
import { currentUserId } from '@/lib/auth';

/**
 * Explains a diagnosis.
 *
 * The diagnostic session lives in the browser, so the context is built there
 * and posted here; the API key is server-side and must never cross that line.
 *
 * Two things this route has to be careful about, because it forwards text to
 * a paid upstream model:
 *
 * - **It is not an open proxy.** Sign-in is required. Without that check the
 *   endpoint would let anyone spend this deployment's API budget on arbitrary
 *   prompts.
 * - **The payload is bounded.** A diagnostic context is a few kilobytes; a
 *   megabyte of text is not a diagnosis and is rejected before it reaches the
 *   provider.
 */

/** Comfortably above a real context, far below anything worth forwarding. */
const MAX_CONTEXT_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const context = (payload as { context?: unknown }).context;
  if (typeof context !== 'string' || context.trim().length === 0) {
    return Response.json({ error: 'A diagnostic context is required.' }, { status: 400 });
  }

  if (new TextEncoder().encode(context).length > MAX_CONTEXT_BYTES) {
    return Response.json({ error: 'That context is too large to explain.' }, { status: 413 });
  }

  const provider = resolveAIProvider();
  const descriptor = provider.describe();

  const result = await provider.explainDiagnosis(context);

  if (!result.ok) {
    // Rule 3: the reason is reported, including when the response was
    // withheld for being ungrounded — the user is entitled to know that the
    // model produced something and it was rejected.
    return Response.json(
      {
        error: result.error.message,
        code: result.error.code,
        violations: result.error.violations ?? [],
        configured: descriptor.configured,
      },
      { status: result.error.code === 'NOT_CONFIGURED' ? 503 : 502 },
    );
  }

  return Response.json({ explanation: result.value });
}
