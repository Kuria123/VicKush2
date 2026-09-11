import { describe, expect, it } from 'vitest';

import { supportsConversation, type ConversationMessage } from '@/domain/ai';

import { AnthropicAIProvider } from './AnthropicAIProvider';
import { UnconfiguredAIProvider } from './UnconfiguredAIProvider';
import { resolveAIProvider } from './registry';

/**
 * The AI provider, with the network injected.
 *
 * The behaviour under test is not the HTTP call — it is what the provider
 * does with what comes back. A model that invents a reading must produce an
 * error, not a paragraph, and that is only demonstrable by handing it a reply
 * that invents one.
 */

const CONTEXT = [
  '# DIAGNOSTIC CONTEXT',
  '## SESSION',
  'Samples recorded: 900',
  '## FINDINGS (what the engine observed)',
  '- [Significant] [Fuel] Lean condition detected',
  '    supporting: Combined fuel trim averaged +22.8% at idle.',
  '## LIMITS OF THIS DIAGNOSIS',
  '- Misfire counts were not read.',
].join('\n');

function replyWith(text: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

function provider(fetchImpl: typeof fetch) {
  return new AnthropicAIProvider({ apiKey: 'test-key', fetchImpl });
}

const GOOD_REPLY = JSON.stringify({
  summary: 'The engine is running lean at idle, with the ECU adding 22.8% extra fuel.',
  reasoning: 'The correction shrinks as airflow rises, which points at unmetered air.',
  caveats: ['Misfire counts were not read.'],
});

describe('AnthropicAIProvider', () => {
  it('declares only what it implements', () => {
    const descriptor = provider(replyWith(GOOD_REPLY)).describe();
    // Both are implemented as of Stage 14, and a capability is only declared
    // once it is — a listed one is a promise the UI will act on.
    expect(descriptor.capabilities).toContain('EXPLAIN_DIAGNOSIS');
    expect(descriptor.capabilities).toContain('CONVERSATION');
    expect(descriptor.configured).toBe(true);
  });

  it('returns a grounded explanation, attributed to the model', async () => {
    const result = await provider(replyWith(GOOD_REPLY)).explainDiagnosis(CONTEXT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain('22.8%');
      expect(result.value.model).toBe('claude-sonnet-5');
    }
  });

  it('withholds an explanation that invents a reading', async () => {
    const invented = JSON.stringify({
      summary: 'The engine is lean and fuel rail pressure was low at 180 kPa.',
      reasoning: 'Low pressure explains the lean mixture.',
      caveats: [],
    });

    const result = await provider(replyWith(invented)).explainDiagnosis(CONTEXT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNGROUNDED_RESPONSE');
      expect(result.error.violations?.some((v) => v.includes('180'))).toBe(true);
    }
  });

  it('checks the caveats too, not only the summary', async () => {
    const invented = JSON.stringify({
      summary: 'The engine is running lean at idle.',
      reasoning: 'The correction shrinks as airflow rises.',
      caveats: ['Coolant temperature peaked at 119 degrees during the scan.'],
    });

    const result = await provider(replyWith(invented)).explainDiagnosis(CONTEXT);
    expect(result.ok).toBe(false);
  });

  it('withholds a part recommendation', async () => {
    const parts = JSON.stringify({
      summary: 'The engine is running lean at idle.',
      reasoning: 'You should replace the intake gasket.',
      caveats: [],
    });

    const result = await provider(replyWith(parts)).explainDiagnosis(CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNGROUNDED_RESPONSE');
  });

  it('reports a malformed reply rather than salvaging it', async () => {
    const result = await provider(replyWith('Sure, here you go!')).explainDiagnosis(CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UPSTREAM_ERROR');
  });

  it('reports rate limiting as retryable', async () => {
    const limited = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    const result = await provider(limited).explainDiagnosis(CONTEXT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.retryable).toBe(true);
    }
  });

  it('reports a network failure rather than swallowing it', async () => {
    const broken = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await provider(broken).explainDiagnosis(CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UPSTREAM_ERROR');
      expect(result.error.message).toContain('ECONNREFUSED');
    }
  });

  it('refuses to call without a key', async () => {
    const result = await new AnthropicAIProvider({ apiKey: '' }).explainDiagnosis(CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CONFIGURED');
  });

  it('sends the context as the message and the rules as the system prompt', async () => {
    let body: Record<string, unknown> = {};
    const capture = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: GOOD_REPLY }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    await provider(capture).explainDiagnosis(CONTEXT);

    expect(String(body.system)).toContain('Use ONLY the numbers');
    expect(JSON.stringify(body.messages)).toContain('Lean condition detected');
  });
});

describe('the AI mechanic', () => {
  const VEHICLE_CONTEXT = [
    '# VEHICLE CONTEXT',
    'Vehicle: Toyota Harrier',
    '## WHAT IS NOT AVAILABLE',
    '- Service history or previous repairs for this vehicle.',
    '## DIAGNOSTIC DATA',
    'No scan has been recorded in this session.',
  ].join('\n');

  const asked: ConversationMessage[] = [{ role: 'user', content: 'My vehicle is shaking.' }];

  it('declares the capability once it implements it', () => {
    expect(provider(replyWith('x')).describe().capabilities).toContain('CONVERSATION');
  });

  it('passes a question back, with the rules as the system prompt', async () => {
    let body: Record<string, unknown> = {};
    const capture = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: 'When does it shake — idling, or moving? Does it change with engine speed?',
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await provider(capture).converse({
      context: VEHICLE_CONTEXT,
      messages: asked,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.content).toContain('When does it shake');

    expect(String(body.system)).toContain('never the end');
    expect(String(body.system)).toContain('Toyota Harrier');
    expect(JSON.stringify(body.messages)).toContain('My vehicle is shaking');
  });

  it('withholds a reply that names a part to fit', async () => {
    const result = await provider(
      replyWith('That will be the engine mounts. You should replace the mounts.'),
    ).converse({ context: VEHICLE_CONTEXT, messages: asked });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNGROUNDED_RESPONSE');
      expect(result.error.violations?.length).toBeGreaterThan(0);
    }
  });

  it('withholds a reply that invents a specification', async () => {
    const result = await provider(
      replyWith('A healthy engine idles at 750 rpm, so yours is low.'),
    ).converse({ context: VEHICLE_CONTEXT, messages: asked });

    expect(result.ok).toBe(false);
  });

  it('allows a reply that repeats what the owner said', async () => {
    const result = await provider(
      replyWith('You said it is worse around 700 rpm. Does it ease when you rev it?'),
    ).converse({
      context: VEHICLE_CONTEXT,
      messages: [{ role: 'user', content: 'It shakes at 700 rpm when stopped.' }],
    });

    expect(result.ok).toBe(true);
  });

  it('refuses an empty conversation rather than inventing an opening', async () => {
    const result = await provider(replyWith('Hello!')).converse({
      context: VEHICLE_CONTEXT,
      messages: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_SUPPORTED');
  });
});

describe('when nothing is configured', () => {
  it('says so rather than producing filler', async () => {
    const unconfigured = new UnconfiguredAIProvider();

    expect(unconfigured.describe().configured).toBe(false);
    expect(unconfigured.describe().capabilities).toHaveLength(0);
    // The UI reads the descriptor rather than probing for the method.
    expect(supportsConversation(unconfigured)).toBe(false);

    const result = await unconfigured.explainDiagnosis();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CONFIGURED');
  });

  it('is what the registry resolves to without a key', () => {
    const resolved = resolveAIProvider({});
    expect(resolved.describe().configured).toBe(false);
  });

  it('resolves the Anthropic provider when a key is present', () => {
    const resolved = resolveAIProvider({
      ANTHROPIC_API_KEY: 'k',
      ANTHROPIC_MODEL: 'claude-opus-5',
    });

    expect(resolved.describe().id).toBe('anthropic');
    expect(resolved.describe().model).toBe('claude-opus-5');
  });
});
