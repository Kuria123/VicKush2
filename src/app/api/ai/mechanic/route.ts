import { supportsConversation } from '@/domain/ai';
import { currentUserId } from '@/lib/auth';
import { resolveAIProvider } from '@/services/ai/registry';

/**
 * One turn of the AI mechanic.
 *
 * Same protections as the explain route — sign-in required, payload bounded —
 * plus a cap on how long a conversation may grow. An unbounded transcript is
 * both a cost problem and a way to push the original instructions out of the
 * model's attention.
 */

const MAX_CONTEXT_BYTES = 64 * 1024;
const MAX_MESSAGE_CHARS = 4000;
const MAX_MESSAGES = 40;

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

  const body = payload as { context?: unknown; messages?: unknown };

  if (typeof body.context !== 'string' || body.context.trim().length === 0) {
    return Response.json({ error: 'A vehicle context is required.' }, { status: 400 });
  }

  if (new TextEncoder().encode(body.context).length > MAX_CONTEXT_BYTES) {
    return Response.json({ error: 'That context is too large.' }, { status: 413 });
  }

  const messages = parseMessages(body.messages);
  if (messages === null) {
    return Response.json({ error: 'Messages are malformed.' }, { status: 400 });
  }
  if (messages.length === 0) {
    return Response.json({ error: 'Say something first.' }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return Response.json(
      { error: 'This conversation has grown too long. Start a new one.' },
      { status: 413 },
    );
  }

  const provider = resolveAIProvider();
  const descriptor = provider.describe();

  if (!supportsConversation(provider)) {
    return Response.json(
      {
        error: descriptor.configured
          ? 'The configured AI provider cannot hold a conversation.'
          : 'No AI provider is configured, so the mechanic is unavailable. The structured diagnosis does not need one.',
        code: descriptor.configured ? 'NOT_SUPPORTED' : 'NOT_CONFIGURED',
        configured: descriptor.configured,
      },
      { status: 503 },
    );
  }

  const result = await provider.converse({ context: body.context, messages });

  if (!result.ok) {
    return Response.json(
      {
        error: result.error.message,
        code: result.error.code,
        violations: result.error.violations ?? [],
      },
      { status: 502 },
    );
  }

  return Response.json({ reply: result.value });
}

/** Null on anything malformed: a partly-understood transcript is not usable. */
function parseMessages(raw: unknown): IncomingMessage[] | null {
  if (!Array.isArray(raw)) return null;

  const messages: IncomingMessage[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { role, content } = entry as { role?: unknown; content?: unknown };

    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string' || content.trim().length === 0) return null;
    if (content.length > MAX_MESSAGE_CHARS) return null;

    messages.push({ role, content });
  }

  return messages;
}
