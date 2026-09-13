import { safetyId, type RepairGuide, type SafetyRequirement } from '../repair';

import type { Scene, SceneSource, VideoScript } from './types';

/**
 * Deriving a video script from an authored repair guide.
 *
 * Deterministic and total: the same guide always produces the same script, and
 * every sentence of narration comes from the guide's own text. No model is
 * involved, which is the direct answer to "do not allow AI to invent
 * safety-critical mechanical procedures" — there is no point in the pipeline
 * at which one could.
 *
 * The ordering is not cosmetic. Safety comes before tools, tools before
 * preparation, preparation before any step. Someone watching in order meets
 * every hazard before they are in a position to encounter it, and the safety
 * scenes are marked `mandatory` so a player cannot skip past them to "the
 * useful bit".
 */

/** Roughly conversational narration pace, used only to estimate a duration. */
const WORDS_PER_SECOND = 2.5;
const MINIMUM_SCENE_SECONDS = 4;

export function buildScript(guide: RepairGuide): VideoScript {
  const scenes: Scene[] = [
    titleScene(guide),
    applicabilityScene(guide),
    ...guide.safety.map((requirement, index) => safetyScene(guide, requirement, index)),
    toolsScene(guide),
    ...guide.preparation.map((step, index) =>
      procedureScene(guide, step, index, 'PREPARATION'),
    ),
    ...guide.steps.map((step, index) => procedureScene(guide, step, index, 'STEP')),
    ...guide.verification.map((check, index) => verificationScene(guide, check, index)),
    limitationsScene(guide),
  ];

  return {
    guideId: guide.id,
    causeId: guide.causeId,
    title: guide.problem,
    scenes: scenes as [Scene, ...Scene[]],
    estimatedSeconds: scenes.reduce((sum, scene) => sum + scene.estimatedSeconds, 0),
    disclaimers: [
      'This is a generic procedure, not one specific to your vehicle. Component locations, fastener types and tightening torques differ.',
      'Every figure this build does not have — torque, part number, capacity, labour time — is missing because it requires authoritative service data, not because it is unimportant.',
      'Watching a procedure is not the same as being qualified to carry it out. Where a step is beyond what you are equipped for, stop.',
    ],
  };
}

/* -------------------------------------------------------------------------
 * Scenes
 * ---------------------------------------------------------------------- */

function titleScene(guide: RepairGuide): Scene {
  const narration = `${guide.problem} This covers the ${guide.system.toLowerCase()} system, and what to inspect: ${guide.component}`;

  return scene({
    id: `${guide.id}-scene-title`,
    kind: 'TITLE',
    heading: guide.problem,
    narration,
    onScreenText: [guide.system, guide.component],
    visualBrief:
      'Static title card. No footage of a vehicle is required, and none should be implied to be the viewer’s own.',
    mandatory: false,
    source: { guideId: guide.id, section: 'TITLE', elementId: null },
  });
}

function applicabilityScene(guide: RepairGuide): Scene {
  return scene({
    id: `${guide.id}-scene-applicability`,
    kind: 'APPLICABILITY',
    heading: 'Before you start',
    narration: guide.vehicleApplicability,
    onScreenText: ['Generic procedure', 'Not specific to your vehicle'],
    visualBrief:
      'Text card. Do not show a specific make or model: doing so would imply a vehicle-specific procedure this is not.',
    mandatory: true,
    source: { guideId: guide.id, section: 'APPLICABILITY', elementId: null },
  });
}

/**
 * One scene per hazard.
 *
 * Deliberately not one combined safety scene. A single card listing four
 * hazards is read as a formality; four scenes, each naming a hazard and what
 * to do about it, are not skimmable in the same way.
 */
function safetyScene(
  guide: RepairGuide,
  requirement: SafetyRequirement,
  index: number,
): Scene {
  const id = safetyId(guide.id, index);

  return scene({
    id: `${guide.id}-scene-safety-${index + 1}`,
    kind: 'SAFETY',
    heading: requirement.severity,
    narration: `${requirement.hazard} ${requirement.control}`,
    onScreenText: [requirement.severity, requirement.control],
    visualBrief:
      'Hold on a full-frame warning card for the whole narration. Do not cut to procedure footage under a safety warning.',
    // Every safety scene. Skipping to the useful bit is skipping the hazard.
    mandatory: true,
    source: { guideId: guide.id, section: 'SAFETY', elementId: id },
  });
}

function toolsScene(guide: RepairGuide): Scene {
  const specialist = guide.tools.filter((tool) => tool.specialist);
  const narration =
    `You will need ${listOf(guide.tools.map((tool) => tool.name))}. ` +
    (specialist.length > 0
      ? `${listOf(specialist.map((tool) => tool.name))} ${specialist.length === 1 ? 'is a specialist tool' : 'are specialist tools'}, and the procedure cannot be completed properly without ${specialist.length === 1 ? 'it' : 'them'}.`
      : 'None of these is a specialist tool.');

  return scene({
    id: `${guide.id}-scene-tools`,
    kind: 'TOOLS',
    heading: 'What you will need',
    narration,
    onScreenText: guide.tools.map((tool) => tool.name),
    visualBrief: 'Tools laid out and named individually as each is mentioned.',
    mandatory: false,
    source: { guideId: guide.id, section: 'TOOLS', elementId: null },
  });
}

function procedureScene(
  guide: RepairGuide,
  step: { id: string; instruction: string; rationale: string; expectedOutcome: string | null },
  index: number,
  kind: 'PREPARATION' | 'STEP',
): Scene {
  const narration = [step.instruction, step.rationale, step.expectedOutcome ?? '']
    .filter((part) => part.length > 0)
    .join(' ');

  return scene({
    id: `${guide.id}-scene-${kind.toLowerCase()}-${index + 1}`,
    kind,
    heading: `${kind === 'PREPARATION' ? 'Preparation' : 'Step'} ${index + 1}`,
    narration,
    onScreenText: [step.instruction],
    visualBrief: `Show the action described. Where the exact component location differs by vehicle, say so on screen rather than implying the one shown is the viewer’s.`,
    mandatory: false,
    source: { guideId: guide.id, section: kind, elementId: step.id },
  });
}

function verificationScene(
  guide: RepairGuide,
  check: { id: string; check: string; passCondition: string },
  index: number,
): Scene {
  return scene({
    id: `${guide.id}-scene-verification-${index + 1}`,
    kind: 'VERIFICATION',
    heading: `Check ${index + 1}`,
    narration: `${check.check} ${check.passCondition}`,
    onScreenText: [check.passCondition],
    visualBrief: 'Show the reading being taken, and the figure itself on screen.',
    mandatory: false,
    source: { guideId: guide.id, section: 'VERIFICATION', elementId: check.id },
  });
}

function limitationsScene(guide: RepairGuide): Scene {
  return scene({
    id: `${guide.id}-scene-limitations`,
    kind: 'LIMITATIONS',
    heading: 'What this does not cover',
    narration: guide.limitations.join(' '),
    onScreenText: [...guide.limitations],
    visualBrief: 'Text card, held long enough to read.',
    // Closing on the limits rather than on a triumphant shot is the point.
    mandatory: true,
    source: { guideId: guide.id, section: 'LIMITATIONS', elementId: null },
  });
}

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

function scene(input: Omit<Scene, 'estimatedSeconds'> & { source: SceneSource }): Scene {
  const words = input.narration.trim().split(/\s+/).length;
  return {
    ...input,
    estimatedSeconds: Math.max(MINIMUM_SCENE_SECONDS, Math.round(words / WORDS_PER_SECOND)),
  };
}

function listOf(items: readonly string[]): string {
  if (items.length === 0) return 'nothing';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
