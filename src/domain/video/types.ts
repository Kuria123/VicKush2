/**
 * Repair video architecture.
 *
 *   repair procedure → video script → scene plan → video provider → video
 *
 * Two constraints from the brief shape every type here, and they pull in the
 * same direction.
 *
 * **Video must not become a dependency of the diagnostic system.** The arrow
 * points one way: this folder imports from `domain/repair`, and nothing in
 * diagnostics, differential, confirmation or repair imports from here. A test
 * asserts it. If video generation is unavailable, broken or removed, every
 * diagnosis still works — which is the difference between a feature and a
 * dependency.
 *
 * **AI must not invent safety-critical mechanical procedures.** So a script is
 * not written by a model. It is *derived*, deterministically, from an authored
 * `RepairGuide`, and every scene carries a `sourceRef` naming the guide element
 * it came from. A scene that cannot name its source is invalid by definition,
 * which makes "the model added a step" a detectable condition rather than a
 * thing to hope does not happen.
 *
 * A provider may rephrase narration for delivery. It may not add procedural
 * content, and `validateScript` is what checks that claim rather than trusting
 * it.
 */

export const SCENE_KINDS = [
  'TITLE',
  'APPLICABILITY',
  'SAFETY',
  'TOOLS',
  'PREPARATION',
  'STEP',
  'VERIFICATION',
  'LIMITATIONS',
] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

/**
 * Where a scene's content came from.
 *
 * Every scene has one. `kind` names the section of the guide and `elementId`
 * the specific item, so a scene can always be traced back and compared against
 * the authored text.
 */
export interface SceneSource {
  guideId: string;
  section: SceneKind;
  /** The step, safety or verification id. Null for whole-section scenes. */
  elementId: string | null;
}

export interface Scene {
  id: string;
  kind: SceneKind;
  /** Shown on screen. Short. */
  heading: string;
  /**
   * What is said over the scene.
   *
   * Derived from the guide's own words. A provider may adjust phrasing for
   * delivery; it may not introduce an instruction that is not in the source.
   */
  narration: string;
  /** Key text burned into the frame, for a viewer with the sound off. */
  onScreenText: readonly string[];
  /**
   * What the footage should show.
   *
   * A description of the shot required, not a promise that it exists. This
   * build has no footage of any vehicle and cannot generate a real one, so
   * this is a brief for whoever or whatever produces the picture.
   */
  visualBrief: string;
  /**
   * A scene a player must not allow to be skipped.
   *
   * True for every safety scene. Someone who skips to "the useful bit" skips
   * the hazard, which is precisely the failure this flag exists to prevent.
   */
  mandatory: boolean;
  /** Rough, from narration length. Not a rendered duration. */
  estimatedSeconds: number;
  source: SceneSource;
}

export interface VideoScript {
  guideId: string;
  causeId: string;
  title: string;
  scenes: readonly [Scene, ...Scene[]];
  /** Sum of the scene estimates. Not a rendered duration. */
  estimatedSeconds: number;
  /**
   * Stated on the script itself, so it survives into whatever is produced
   * from it.
   */
  disclaimers: readonly [string, ...string[]];
}

/* -------------------------------------------------------------------------
 * The provider seam
 * ---------------------------------------------------------------------- */

export const VIDEO_CAPABILITIES = [
  /** Can turn a scene plan into a rendered video. */
  'RENDER_VIDEO',
  /** Can produce narration audio without picture. */
  'RENDER_NARRATION',
] as const;
export type VideoCapability = (typeof VIDEO_CAPABILITIES)[number];

export interface VideoProviderDescriptor {
  id: string;
  name: string;
  capabilities: readonly VideoCapability[];
  /** False means it cannot be called; the UI must say so, not show a spinner. */
  configured: boolean;
}

export type VideoErrorCode =
  | 'NOT_CONFIGURED'
  | 'NOT_SUPPORTED'
  | 'INVALID_SCRIPT'
  | 'UPSTREAM_ERROR';

export interface VideoError {
  code: VideoErrorCode;
  message: string;
  retryable: boolean;
  /** Populated on INVALID_SCRIPT: what the validator objected to. */
  violations?: readonly string[];
}

export type VideoResult<T> = { ok: true; value: T } | { ok: false; error: VideoError };

export function videoOk<T>(value: T): VideoResult<T> {
  return { ok: true, value };
}

export function videoFail<T>(
  code: VideoErrorCode,
  message: string,
  options: { retryable?: boolean; violations?: readonly string[] } = {},
): VideoResult<T> {
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

/** A rendering job. Asynchronous by nature: rendering is not instant. */
export interface VideoJob {
  id: string;
  status: 'QUEUED' | 'RENDERING' | 'READY' | 'FAILED';
  /** Present only when READY. */
  url: string | null;
  /** Present only when FAILED, and never empty when it is. */
  failureReason: string | null;
}

export interface VideoProvider {
  describe(): VideoProviderDescriptor;
  /**
   * Submits a scene plan for rendering.
   *
   * Takes the whole script rather than free text, so a provider is given a
   * validated plan and never an opportunity to compose one.
   */
  render(script: VideoScript): Promise<VideoResult<VideoJob>>;
  getJob(jobId: string): Promise<VideoResult<VideoJob>>;
}
