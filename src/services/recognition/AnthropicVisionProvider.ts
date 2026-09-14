import {
  RECOGNITION_SYSTEM_PROMPT,
  buildRecognitionUserPrompt,
  type ProposalBasis,
  type RawClaim,
  type RecognitionImage,
  type RecognitionOutcome,
  type RecognitionProvider,
  type RecognitionProviderDescriptor,
} from '@/domain/recognition';

/**
 * Vehicle recognition backed by the Anthropic Messages API.
 *
 * Written against `fetch`, like the diagnostic provider, and for the same
 * reason: one POST with a fixed body shape.
 *
 * This class deliberately does no judging. It sends the images, parses the
 * reply strictly, and hands the claims to `interpretRecognition`, which is
 * where every rule about what may be believed lives. Putting any of that here
 * would mean a second vision provider could arrive later with its own opinion
 * about what a VIN looks like.
 *
 * Server-side only. The key must never reach the browser, and the images are
 * photographs of the user's own vehicle.
 */

export interface AnthropicVisionOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Injectable for tests, so parsing and failure handling can be driven. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-5';
const API_VERSION = '2023-06-01';

/**
 * The most images examined in one request.
 *
 * Each one costs tokens, and a walkaround video can supply as many frames as
 * anyone cares to sample. Eight is enough to catch a badge, a tailgate script
 * and a plate from several angles; beyond that the marginal frame is another
 * view of the same door.
 */
const MAX_IMAGES = 8;

const BASES: readonly ProposalBasis[] = [
  'READ_FROM_TEXT',
  'READ_FROM_BADGE',
  'INFERRED_FROM_APPEARANCE',
];

const FIELDS: readonly RawClaim['field'][] = [
  'make',
  'model',
  'year',
  'vin',
  'fuelType',
  'transmissionType',
  'registrationPlate',
  'bodyColour',
];

export class AnthropicVisionProvider implements RecognitionProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: AnthropicVisionOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 1500;
    // Longer than the text calls: several images have to be uploaded first.
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
  }

  describe(): RecognitionProviderDescriptor {
    return {
      id: 'anthropic-vision',
      name: 'Anthropic vision',
      configured: this.apiKey.length > 0,
      maxImages: MAX_IMAGES,
      model: this.model,
    };
  }

  async recognise(images: readonly RecognitionImage[]): Promise<RecognitionOutcome> {
    if (this.apiKey.length === 0) {
      return {
        ok: false,
        reason: 'NOT_CONFIGURED',
        message: 'No API key is set for the Anthropic vision provider.',
      };
    }

    if (images.length === 0) {
      return { ok: false, reason: 'NOTHING_LEGIBLE', message: 'No images were supplied.' };
    }

    if (images.length > MAX_IMAGES) {
      // Refused rather than silently truncated: an owner who supplied twelve
      // frames should not be told about a vehicle examined from eight of them
      // without knowing which four were dropped.
      return {
        ok: false,
        reason: 'TOO_MANY_IMAGES',
        message: `At most ${MAX_IMAGES} images can be examined at once; ${images.length} were supplied.`,
      };
    }

    const content = [
      ...images.map((image) => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: image.mediaType,
          data: image.base64,
        },
      })),
      { type: 'text' as const, text: buildRecognitionUserPrompt(images.length) },
    ];

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
          system: RECOGNITION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // Rule 3: the reason survives rather than becoming a generic failure.
      return {
        ok: false,
        reason: 'PROVIDER_ERROR',
        message: `The vision request did not complete: ${String(error)}`,
      };
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      return {
        ok: false,
        reason: 'RATE_LIMITED',
        message: 'The vision provider is rate limiting requests. Try again shortly.',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: 'PROVIDER_ERROR',
        message: `The vision provider returned ${response.status}.`,
      };
    }

    const text = await this.extractText(response);
    if (text === null) {
      return {
        ok: false,
        reason: 'MALFORMED_REPLY',
        message: 'The vision provider returned no readable text.',
      };
    }

    const claims = parseClaims(text);
    if (claims === null) {
      // A malformed reply is a failed call, not something to salvage. Pulling
      // whatever fields happen to parse out of broken JSON is how half a
      // sentence becomes a VIN.
      return {
        ok: false,
        reason: 'MALFORMED_REPLY',
        message: 'The vision provider’s reply was not the JSON this expects.',
      };
    }

    return {
      ok: true,
      model: this.model,
      raw: { imagesExamined: images.length, claims },
    };
  }

  private async extractText(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as {
        content?: { type?: string; text?: string }[];
      };

      const text = (body.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')
        .trim();

      return text.length > 0 ? text : null;
    } catch {
      return null;
    }
  }
}

/**
 * Reads the claims out of the reply.
 *
 * Every claim is shape-checked here and value-checked in the domain. This half
 * only answers "is this the structure asked for" — a claim that parses is not
 * a claim that is believed, and nothing in this function decides anything
 * about a vehicle.
 */
export function parseClaims(text: string): RawClaim[] | null {
  // Models add a fence despite being told not to; that is a formatting habit
  // rather than a malformed answer, so it is stripped rather than rejected.
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const claims = (parsed as { claims?: unknown }).claims;

  // An empty array is a valid answer — "nothing was legible" — and must not be
  // confused with a reply that failed to parse.
  if (!Array.isArray(claims)) return null;

  const out: RawClaim[] = [];
  for (const item of claims) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;

    const field = record.field;
    const value = record.value;
    const basis = record.basis;
    const confidence = record.confidence;

    if (typeof field !== 'string' || !FIELDS.includes(field as RawClaim['field'])) continue;
    if (typeof basis !== 'string' || !BASES.includes(basis as ProposalBasis)) continue;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) continue;
    if (typeof value !== 'string' && typeof value !== 'number') continue;

    out.push({
      field: field as RawClaim['field'],
      value: String(value),
      basis: basis as ProposalBasis,
      confidence,
      observation: typeof record.observation === 'string' ? record.observation : '',
    });
  }

  return out;
}
