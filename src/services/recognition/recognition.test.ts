import { describe, expect, it } from 'vitest';

import type { RecognitionImage } from '@/domain/recognition';

import { AnthropicVisionProvider, parseClaims } from './AnthropicVisionProvider';
import { UnconfiguredRecognitionProvider } from './UnconfiguredRecognitionProvider';
import {
  createRecognitionProvider,
  isRecognitionProviderRegistered,
  registerRecognitionProvider,
  resolveRecognitionProvider,
} from './registry';

/**
 * The vision provider.
 *
 * It does no judging — every rule about what may be believed lives in
 * `domain/recognition`. So these tests are about the two things a provider can
 * still get wrong: sending something it should have refused, and salvaging
 * meaning from a reply that did not parse.
 */

function image(): RecognitionImage {
  return { base64: 'AAAA', mediaType: 'image/jpeg', origin: { kind: 'PHOTO' } };
}

function provider(fetchImpl: typeof fetch) {
  return new AnthropicVisionProvider({ apiKey: 'test-key', fetchImpl, timeoutMs: 1_000 });
}

function reply(text: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('with nothing configured', () => {
  const unconfigured = new UnconfiguredRecognitionProvider();

  it('recognises nothing and says why', async () => {
    const outcome = await unconfigured.recognise();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('NOT_CONFIGURED');
      expect(outcome.message).toMatch(/ANTHROPIC_API_KEY/);
      // The manual path is unaffected, and the message says so rather than
      // leaving someone stuck on a screen that cannot work.
      expect(outcome.message).toMatch(/by hand works/i);
    }
  });

  it('declares itself unable rather than quietly offering nothing', () => {
    const descriptor = unconfigured.describe();
    expect(descriptor.configured).toBe(false);
    expect(descriptor.maxImages).toBe(0);
    expect(descriptor.model).toBeNull();
  });
});

describe('the registry', () => {
  it('falls back to unconfigured with no key', () => {
    expect(resolveRecognitionProvider({}).describe().configured).toBe(false);
  });

  it('uses the vision provider once a key is present', () => {
    const descriptor = resolveRecognitionProvider({ ANTHROPIC_API_KEY: 'k' }).describe();
    expect(descriptor.configured).toBe(true);
    expect(descriptor.id).toBe('anthropic-vision');
  });

  it('lets the vision model be chosen independently of the reasoning one', () => {
    const descriptor = resolveRecognitionProvider({
      ANTHROPIC_API_KEY: 'k',
      RECOGNITION_MODEL: 'some-vision-model',
    }).describe();

    expect(descriptor.model).toBe('some-vision-model');
  });

  it('registers the built-in provider', () => {
    registerRecognitionProvider('test-vision', () => new UnconfiguredRecognitionProvider());
    expect(isRecognitionProviderRegistered('test-vision')).toBe(true);
    expect(createRecognitionProvider('test-vision')).not.toBeNull();
    expect(createRecognitionProvider('no-such-provider')).toBeNull();
  });
});

describe('what it refuses to send', () => {
  it('refuses an empty set of images', async () => {
    const outcome = await provider(reply('{"claims":[]}')).recognise([]);
    expect(outcome.ok).toBe(false);
  });

  it('refuses too many rather than silently dropping some', async () => {
    const many = Array.from({ length: 20 }, image);
    const outcome = await provider(reply('{"claims":[]}')).recognise(many);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // An owner who supplied twenty frames should not be told about a vehicle
      // examined from eight of them without knowing which twelve were dropped.
      expect(outcome.reason).toBe('TOO_MANY_IMAGES');
      expect(outcome.message).toMatch(/20 were supplied/);
    }
  });

  it('refuses without a key, and never sends the request', async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const outcome = await new AnthropicVisionProvider({ apiKey: '', fetchImpl: spy }).recognise([
      image(),
    ]);

    expect(outcome.ok).toBe(false);
    expect(called).toBe(false);
  });
});

describe('what comes back', () => {
  it('passes well-formed claims through untouched', async () => {
    const outcome = await provider(
      reply(
        '{"claims":[{"field":"make","value":"Toyota","basis":"READ_FROM_BADGE","confidence":88,"observation":"Grille emblem."}]}',
      ),
    ).recognise([image()]);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.raw.imagesExamined).toBe(1);
      expect(outcome.raw.claims).toHaveLength(1);
      // Untouched: the provider does not get to adjust a confidence, because
      // then two providers would disagree about what a number means.
      expect(outcome.raw.claims[0]?.confidence).toBe(88);
    }
  });

  it('accepts an empty claims array as a real answer', async () => {
    const outcome = await provider(reply('{"claims":[]}')).recognise([image()]);

    // "Nothing was legible" is a correct answer and must not be confused with
    // a reply that failed to parse.
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.raw.claims).toEqual([]);
  });

  it('treats a malformed reply as a failed call, not something to salvage', async () => {
    const outcome = await provider(reply('I looked at the car and it seems to be a Toyota.'))
      .recognise([image()]);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('MALFORMED_REPLY');
  });

  it('reports a rate limit as itself, so the caller can back off', async () => {
    const limited = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
    const outcome = await provider(limited).recognise([image()]);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('RATE_LIMITED');
  });

  it('reports a transport failure with its reason rather than swallowing it', async () => {
    const broken = (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;

    const outcome = await provider(broken).recognise([image()]);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('PROVIDER_ERROR');
      expect(outcome.message).toMatch(/socket hang up/);
    }
  });
});

describe('parseClaims', () => {
  it('strips a code fence, which models add despite being told not to', () => {
    const claims = parseClaims(
      '```json\n{"claims":[{"field":"model","value":"Harrier","basis":"READ_FROM_BADGE","confidence":70,"observation":"Tailgate script."}]}\n```',
    );

    // A formatting habit, not a malformed answer.
    expect(claims).toHaveLength(1);
  });

  it('drops a claim about a field that does not exist', () => {
    const claims = parseClaims(
      '{"claims":[{"field":"ownerName","value":"Gerald","basis":"READ_FROM_TEXT","confidence":90,"observation":"x"}]}',
    );

    expect(claims).toEqual([]);
  });

  it('drops a claim with a basis outside the three', () => {
    const claims = parseClaims(
      '{"claims":[{"field":"make","value":"Toyota","basis":"JUST_A_HUNCH","confidence":90,"observation":"x"}]}',
    );

    expect(claims).toEqual([]);
  });

  it('drops a claim whose confidence is not a number', () => {
    const claims = parseClaims(
      '{"claims":[{"field":"make","value":"Toyota","basis":"READ_FROM_BADGE","confidence":"very","observation":"x"}]}',
    );

    expect(claims).toEqual([]);
  });

  it('returns null for JSON that is not the expected shape', () => {
    // Distinct from an empty array: one means "nothing seen", the other means
    // "this reply cannot be trusted at all".
    expect(parseClaims('{"vehicle":"Toyota Harrier"}')).toBeNull();
    expect(parseClaims('[]')).toBeNull();
    expect(parseClaims('not json')).toBeNull();
  });

  it('accepts a numeric year, which models return unquoted', () => {
    const claims = parseClaims(
      '{"claims":[{"field":"year","value":2018,"basis":"INFERRED_FROM_APPEARANCE","confidence":50,"observation":"Facelift lights."}]}',
    );

    expect(claims?.[0]?.value).toBe('2018');
  });
});
