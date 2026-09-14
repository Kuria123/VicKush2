/**
 * Turning what the owner picked into images a vision model can look at.
 *
 * Runs in the browser, deliberately, and that is the privacy decision as much
 * as the performance one: **the video never leaves the device.** A walkaround
 * clip is tens of megabytes of the owner's driveway, their house and their
 * number plate. Frames are lifted out here, downscaled here, and only those
 * few stills are uploaded.
 *
 * It is also the cheaper answer. Server-side video decoding would mean ffmpeg,
 * a queue and a storage bucket to hold clips nothing reads back — a great deal
 * of infrastructure to arrive at the same eight JPEGs (Rule 13).
 */

export interface CapturedImage {
  /** Base64 with no data: prefix, which is what the API expects. */
  base64: string;
  mediaType: 'image/jpeg';
  /** Present when the frame came out of a video. */
  atSeconds?: number;
  /** A data URL, for showing the owner what is about to be sent. */
  preview: string;
}

/**
 * The longest edge of an uploaded image.
 *
 * Large enough that a tailgate badge and a number plate survive; small enough
 * that eight of them are a reasonable upload on a phone. A 12-megapixel
 * original carries no more legible text than this does — it carries more
 * pixels of the same text, at several times the cost.
 */
export const MAX_EDGE_PX = 1400;

/** Matches the provider's own ceiling. Kept in step with `MAX_IMAGES` there. */
export const MAX_IMAGES = 8;

/** JPEG quality. Below about 0.8, compression artefacts start eating small text. */
const JPEG_QUALITY = 0.85;

export type CaptureFailure =
  | { ok: false; reason: 'UNSUPPORTED_TYPE'; message: string }
  | { ok: false; reason: 'DECODE_FAILED'; message: string };

export type CaptureResult = { ok: true; images: CapturedImage[] } | CaptureFailure;

/**
 * Reads whatever the owner selected: stills, clips, or a mixture.
 *
 * Files are processed in the order given and the result is capped at
 * `MAX_IMAGES`, so a long video plus three photos does not silently become a
 * request the server will refuse.
 */
export async function captureFrom(files: readonly File[]): Promise<CaptureResult> {
  const images: CapturedImage[] = [];

  for (const file of files) {
    if (images.length >= MAX_IMAGES) break;

    const remaining = MAX_IMAGES - images.length;

    if (file.type.startsWith('image/')) {
      const image = await captureStill(file);
      if (!image.ok) return image;
      images.push(image.image);
      continue;
    }

    if (file.type.startsWith('video/')) {
      const frames = await captureFrames(file, Math.min(remaining, 4));
      if (!frames.ok) return frames;
      images.push(...frames.images);
      continue;
    }

    return {
      ok: false,
      reason: 'UNSUPPORTED_TYPE',
      message: `"${file.name}" is neither an image nor a video.`,
    };
  }

  return { ok: true, images };
}

async function captureStill(
  file: File,
): Promise<{ ok: true; image: CapturedImage } | CaptureFailure> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Rule 3: a file the browser cannot decode is reported, not skipped. A
    // silently dropped photo is one the owner believes was examined.
    return {
      ok: false,
      reason: 'DECODE_FAILED',
      message: `"${file.name}" could not be read as an image.`,
    };
  }

  try {
    return { ok: true, image: toCapturedImage(bitmap) };
  } finally {
    bitmap.close();
  }
}

/**
 * Samples a video at even intervals.
 *
 * Even spacing rather than anything cleverer: a walkaround is a slow circuit
 * of the vehicle, so evenly spaced frames are four different sides of it.
 * Picking "the sharpest" frames would cluster them wherever the camera paused,
 * which is usually the same side.
 */
async function captureFrames(
  file: File,
  count: number,
): Promise<{ ok: true; images: CapturedImage[] } | CaptureFailure> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    const duration = await new Promise<number>((resolve, reject) => {
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error('metadata'));
    });

    if (!Number.isFinite(duration) || duration <= 0) {
      return {
        ok: false,
        reason: 'DECODE_FAILED',
        message: `"${file.name}" has no readable duration.`,
      };
    }

    const images: CapturedImage[] = [];
    for (let i = 0; i < count; i += 1) {
      // Offset by half a step so the first frame is not frame zero, which on a
      // hand-held clip is usually the ground or a blurred pan.
      const atSeconds = (duration * (i + 0.5)) / count;
      const frame = await seekAndGrab(video, atSeconds);
      if (frame) images.push({ ...frame, atSeconds: Number(atSeconds.toFixed(2)) });
    }

    if (images.length === 0) {
      return {
        ok: false,
        reason: 'DECODE_FAILED',
        message: `No frames could be read from "${file.name}".`,
      };
    }

    return { ok: true, images };
  } catch {
    return {
      ok: false,
      reason: 'DECODE_FAILED',
      message: `"${file.name}" could not be read as a video by this browser.`,
    };
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

async function seekAndGrab(
  video: HTMLVideoElement,
  atSeconds: number,
): Promise<Omit<CapturedImage, 'atSeconds'> | null> {
  const seeked = new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  video.currentTime = atSeconds;
  await seeked;

  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  return toCapturedImage(video, video.videoWidth, video.videoHeight);
}

/** Downscales onto a canvas and encodes. One place, so stills and frames match. */
function toCapturedImage(
  source: CanvasImageSource,
  sourceWidth?: number,
  sourceHeight?: number,
): CapturedImage {
  const width = sourceWidth ?? (source as ImageBitmap).width;
  const height = sourceHeight ?? (source as ImageBitmap).height;

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser did not provide a 2D canvas context.');

  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const preview = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return {
    base64: preview.slice(preview.indexOf(',') + 1),
    mediaType: 'image/jpeg',
    preview,
  };
}
