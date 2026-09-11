/**
 * The AI abstraction.
 *
 * The layering the spec requires, and the reason for every decision in this
 * folder:
 *
 *   vehicle data → structured diagnostic engine → evidence + ranked causes
 *                → AI reasoning layer → human-readable experience
 *
 * The AI sits at the *end* of that chain. It explains what the deterministic
 * engine concluded; it does not conclude anything itself, and it is never
 * consulted to fill a gap in the readings (Rule 8).
 *
 * Concretely, this means the AI is given a closed context — a serialisation
 * of what was actually measured — and its output is checked back against that
 * context before a user ever sees it. An explanation that introduces a number
 * nobody measured is rejected rather than displayed, because a fabricated
 * reading presented in fluent prose is more dangerous than no explanation at
 * all.
 *
 * Mirrors the OBD provider contract deliberately: capabilities are declared
 * rather than assumed, outcomes are returned rather than thrown, and a
 * provider that is not configured says so instead of degrading into
 * plausible-sounding filler.
 */

export const AI_CAPABILITIES = [
  /** Turns a finished diagnosis into prose. */
  'EXPLAIN_DIAGNOSIS',
  /** Multi-turn questioning about a specific vehicle. Stage 14. */
  'CONVERSATION',
] as const;
export type AICapability = (typeof AI_CAPABILITIES)[number];

export interface AIProviderDescriptor {
  id: string;
  name: string;
  /** The model actually used, so an explanation can be attributed. */
  model: string | null;
  capabilities: readonly AICapability[];
  /**
   * Whether this provider can actually be called right now.
   *
   * False means no credentials, no network, or no model — and the UI must say
   * so rather than showing an empty explanation panel that looks like a
   * vehicle with nothing wrong.
   */
  configured: boolean;
}

export type AIErrorCode =
  | 'NOT_CONFIGURED'
  | 'NOT_SUPPORTED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UPSTREAM_ERROR'
  /** The response failed the grounding check and was withheld. */
  | 'UNGROUNDED_RESPONSE';

export interface AIError {
  code: AIErrorCode;
  message: string;
  retryable: boolean;
  /** Populated on UNGROUNDED_RESPONSE: what the check objected to. */
  violations?: readonly string[];
}

export type AIResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AIError };

export function aiOk<T>(value: T): AIResult<T> {
  return { ok: true, value };
}

export function aiFail<T>(
  code: AIErrorCode,
  message: string,
  options: { retryable?: boolean; violations?: readonly string[] } = {},
): AIResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: options.retryable ?? false,
      violations: options.violations,
    },
  };
}

/** What the AI produced, with the provenance needed to present it honestly. */
export interface AIExplanation {
  /** Plain-language summary of what the engine concluded. */
  summary: string;
  /** Why the leading cause fits, in the engine's own terms. */
  reasoning: string;
  /** What the user should understand about the limits of this diagnosis. */
  caveats: readonly string[];
  /** The model that wrote it, shown to the user. */
  model: string;
}

/** One reply from the mechanic, with the provenance to present it honestly. */
export interface AIReply {
  /** What to say back to the owner. */
  content: string;
  model: string;
}

export interface ConverseRequest {
  /** The closed vehicle + diagnosis context. */
  context: string;
  /** The exchange so far, oldest first, ending with the owner's message. */
  messages: readonly { role: 'user' | 'assistant'; content: string }[];
}

export interface AIProvider {
  describe(): AIProviderDescriptor;

  /**
   * Explains a finished diagnosis.
   *
   * Takes the serialised context rather than the live objects: the boundary
   * is a string the caller can inspect, log and diff, which matters when the
   * question "what was this model actually told?" has to be answerable.
   */
  explainDiagnosis(context: string): Promise<AIResult<AIExplanation>>;

  /**
   * Continues a vehicle-specific conversation.
   *
   * Optional, and gated behind the `CONVERSATION` capability: a provider that
   * cannot converse must not be asked to, and the UI reads the descriptor
   * rather than probing for the method.
   */
  converse?(request: ConverseRequest): Promise<AIResult<AIReply>>;
}

export function supportsConversation(
  provider: AIProvider,
): provider is AIProvider & Required<Pick<AIProvider, 'converse'>> {
  return (
    hasAICapability(provider.describe(), 'CONVERSATION') &&
    typeof provider.converse === 'function'
  );
}

export function hasAICapability(
  descriptor: AIProviderDescriptor,
  capability: AICapability,
): boolean {
  return descriptor.capabilities.includes(capability);
}
