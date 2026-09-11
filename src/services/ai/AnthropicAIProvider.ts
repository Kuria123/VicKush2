import {
  aiFail,
  aiOk,
  checkGrounding,
  groundingCorpus,
  parseExplanationJson,
  EXPLANATION_SYSTEM_PROMPT,
  MECHANIC_SYSTEM_PROMPT,
  type AIExplanation,
  type AIProvider,
  type AIProviderDescriptor,
  type AIReply,
  type AIResult,
  type ConverseRequest,
} from '@/domain/ai';

/**
 * An AI provider backed by the Anthropic Messages API.
 *
 * Written against `fetch` rather than an SDK: the call is one POST with a
 * fixed body shape, and a dependency that has to be kept current for the sake
 * of it is not worth carrying (Rule 13).
 *
 * The important part of this class is not the request. It is what happens to
 * the reply: it is parsed strictly, then checked against the very context it
 * was given, and withheld if it introduces anything that context does not
 * support. A model that invents a reading here produces an error, not a
 * paragraph (Rule 8).
 *
 * It runs server-side only. The key must never reach the browser, and the
 * diagnostic context is the user's vehicle data.
 */

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Injectable for tests, so the grounding behaviour can be driven. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-5';
const API_VERSION = '2023-06-01';

export class AnthropicAIProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: AnthropicOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 1200;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
  }

  describe(): AIProviderDescriptor {
    return {
      id: 'anthropic',
      name: 'Anthropic',
      model: this.model,
      // CONVERSATION is Stage 14 and is not implemented, so it is not
      // claimed. A declared capability is a promise the UI will act on.
      capabilities: ['EXPLAIN_DIAGNOSIS', 'CONVERSATION'],
      configured: this.apiKey.length > 0,
    };
  }

  async explainDiagnosis(context: string): Promise<AIResult<AIExplanation>> {
    const reply = await this.send(EXPLANATION_SYSTEM_PROMPT, [
      { role: 'user', content: context },
    ]);
    if (!reply.ok) return aiFail(reply.error.code, reply.error.message, {
      retryable: reply.error.retryable,
    });

    const parsed = parseExplanationJson(reply.value);
    if (!parsed) {
      return aiFail(
        'UPSTREAM_ERROR',
        'The AI provider did not return the requested JSON structure.',
      );
    }

    /*
     * The check that matters. The model is asked to follow the rules; this is
     * what happens when it does not. Every field is checked, because an
     * invented figure buried in a caveat is no better than one in the summary.
     */
    const report = checkGrounding(
      [parsed.summary, parsed.reasoning, ...parsed.caveats].join('\n'),
      context,
    );

    if (!report.grounded) {
      return aiFail(
        'UNGROUNDED_RESPONSE',
        'The explanation was withheld because it was not supported by the diagnostic data.',
        { violations: report.violations.map((v) => v.detail), retryable: true },
      );
    }

    return aiOk({
      summary: parsed.summary,
      reasoning: parsed.reasoning,
      caveats: parsed.caveats,
      model: this.model,
    });
  }

  /**
   * The mechanic turn.
   *
   * The reply is checked against the context *and the owner's own messages*:
   * repeating back a figure the owner supplied is not a fabrication, but
   * inventing a reading still is. A reply that fails is withheld rather than
   * shown with a warning — the owner is being advised, and advice built on a
   * made-up number is worse than a request to try again.
   */
  async converse({ context, messages }: ConverseRequest): Promise<AIResult<AIReply>> {
    if (messages.length === 0) {
      return aiFail('NOT_SUPPORTED', 'A conversation needs at least one message.');
    }

    const reply = await this.send(
      `${MECHANIC_SYSTEM_PROMPT}\n\n${context}`,
      messages.map((message) => ({ role: message.role, content: message.content })),
    );
    if (!reply.ok) return aiFail(reply.error.code, reply.error.message, {
      retryable: reply.error.retryable,
    });

    const report = checkGrounding(reply.value, groundingCorpus(context, messages));
    if (!report.grounded) {
      return aiFail(
        'UNGROUNDED_RESPONSE',
        'That reply was withheld because it went beyond what is known about this vehicle.',
        { violations: report.violations.map((v) => v.detail), retryable: true },
      );
    }

    return aiOk({ content: reply.value.trim(), model: this.model });
  }

  /** One request to the Messages API, returning the text it produced. */
  private async send(
    system: string,
    messages: readonly { role: 'user' | 'assistant'; content: string }[],
  ): Promise<AIResult<string>> {
    if (this.apiKey.length === 0) {
      return aiFail('NOT_CONFIGURED', 'No API key is set for the Anthropic provider.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system,
          messages,
        }),
        signal: controller.signal,
      });
    } catch (cause) {
      // Rule 3: report it, with what actually went wrong.
      const aborted = cause instanceof Error && cause.name === 'AbortError';
      return aiFail(
        aborted ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        aborted
          ? `The AI provider did not respond within ${this.timeoutMs / 1000} seconds.`
          : `Could not reach the AI provider: ${cause instanceof Error ? cause.message : String(cause)}`,
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      return aiFail('RATE_LIMITED', 'The AI provider is rate limiting requests.', {
        retryable: true,
      });
    }

    if (!response.ok) {
      const detail = await safeText(response);
      return aiFail(
        'UPSTREAM_ERROR',
        `The AI provider returned ${response.status}.${detail ? ` ${detail}` : ''}`,
        { retryable: response.status >= 500 },
      );
    }

    const text = await this.extractText(response);
    if (text === null) {
      return aiFail('UPSTREAM_ERROR', 'The AI provider returned no text content.');
    }

    return aiOk(text);
  }

  private async extractText(response: Response): Promise<string | null> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return null;
    }

    const content = (payload as { content?: unknown }).content;
    if (!Array.isArray(content)) return null;

    const parts = content
      .filter(
        (block): block is { type: 'text'; text: string } =>
          typeof block === 'object' &&
          block !== null &&
          (block as { type?: unknown }).type === 'text' &&
          typeof (block as { text?: unknown }).text === 'string',
      )
      .map((block) => block.text);

    return parts.length > 0 ? parts.join('\n') : null;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '';
  }
}
