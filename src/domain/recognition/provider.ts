import type { RawRecognition } from './engine';

/**
 * The seam a vision provider plugs into.
 *
 * Same shape as the OBD, AI, video, cost and marketplace seams. A provider
 * returns *claims*, never a result: `interpretRecognition` decides what
 * survives, and keeping that decision out of the provider is what stops a
 * second provider arriving later with its own idea of what a VIN looks like.
 */

/** An image to examine. Base64 so the domain never touches a Blob or a Buffer. */
export interface RecognitionImage {
  /** Base64-encoded bytes, no data: prefix. */
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /**
   * Where it came from, for the owner's benefit: a still, or a frame lifted
   * out of a video at a stated time.
   */
  origin: { kind: 'PHOTO' } | { kind: 'VIDEO_FRAME'; atSeconds: number };
}

export interface RecognitionProviderDescriptor {
  id: string;
  name: string;
  configured: boolean;
  /** Most images it will look at in one request. Zero when unconfigured. */
  maxImages: number;
  model: string | null;
}

export type RecognitionOutcome =
  | { ok: true; raw: RawRecognition; model: string }
  | { ok: false; reason: RecognitionFailure; message: string };

export type RecognitionFailure =
  /** No provider is configured. Not an error — the ordinary state here. */
  | 'NOT_CONFIGURED'
  /** The provider was called and refused or failed. */
  | 'PROVIDER_ERROR'
  /** The reply did not parse. A malformed reply is a failed call, not salvage. */
  | 'MALFORMED_REPLY'
  /** Nothing usable was in the images. */
  | 'NOTHING_LEGIBLE'
  | 'TOO_MANY_IMAGES'
  | 'RATE_LIMITED';

export interface RecognitionProvider {
  describe(): RecognitionProviderDescriptor;
  /**
   * Examines the images and reports what it claims to see.
   *
   * Returns an outcome rather than throwing, like every other provider here:
   * an illegible photograph is a result, not an exception.
   */
  recognise(images: readonly RecognitionImage[]): Promise<RecognitionOutcome>;
}
