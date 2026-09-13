import { safetyId, type RepairGuide } from '../repair';

import type { VideoScript } from './types';

/**
 * Checking a script against the guide it claims to come from.
 *
 * This is what makes "AI must not invent safety-critical mechanical
 * procedures" an enforced property rather than an intention. A provider is
 * permitted to rephrase narration for delivery — a rendering pipeline that
 * cannot adjust wording is not much use. What it may not do is add, drop or
 * reorder procedural content, and every rule here exists to catch one of those
 * three.
 *
 * The check runs against the *authored guide*, not against the script's own
 * claims about itself. A script that has been tampered with cannot exonerate
 * itself by also editing its `sourceRef`s: the ids have to resolve to real
 * elements of a real guide.
 */

export interface ScriptViolation {
  sceneId: string | null;
  detail: string;
}

export function validateScript(script: VideoScript, guide: RepairGuide): ScriptViolation[] {
  const violations: ScriptViolation[] = [];
  const fail = (sceneId: string | null, detail: string) =>
    violations.push({ sceneId, detail });

  if (script.guideId !== guide.id) {
    fail(null, `Script claims guide "${script.guideId}" but was checked against "${guide.id}".`);
    return violations;
  }

  /* --- Every scene traces to something real -------------------------- */
  const stepIds = new Set([...guide.preparation, ...guide.steps].map((step) => step.id));
  const verificationIds = new Set(guide.verification.map((check) => check.id));
  const safetyIds = new Set(guide.safety.map((_, index) => safetyId(guide.id, index)));

  for (const scene of script.scenes) {
    if (scene.source.guideId !== guide.id) {
      fail(scene.id, 'Scene cites a different guide than the script it belongs to.');
      continue;
    }

    const { section, elementId } = scene.source;

    if (section !== scene.kind) {
      fail(scene.id, `Scene is a ${scene.kind} scene but cites a ${section} source.`);
    }

    // A scene that cannot name a real source is, by definition, invented.
    if (section === 'SAFETY' && (!elementId || !safetyIds.has(elementId))) {
      fail(scene.id, 'Safety scene does not correspond to a safety requirement in the guide.');
    }
    if (
      (section === 'STEP' || section === 'PREPARATION') &&
      (!elementId || !stepIds.has(elementId))
    ) {
      fail(scene.id, 'Procedure scene does not correspond to a step in the guide.');
    }
    if (section === 'VERIFICATION' && (!elementId || !verificationIds.has(elementId))) {
      fail(scene.id, 'Verification scene does not correspond to a check in the guide.');
    }
  }

  /* --- Nothing was dropped -------------------------------------------- */
  const cited = new Set(
    script.scenes
      .map((scene) => scene.source.elementId)
      .filter((id): id is string => id !== null),
  );

  for (const id of safetyIds) {
    if (!cited.has(id)) {
      fail(null, `Safety requirement "${id}" from the guide has no scene. It would never be seen.`);
    }
  }
  for (const step of guide.steps) {
    if (!cited.has(step.id)) {
      fail(null, `Step "${step.id}" from the guide has no scene, so the procedure is incomplete.`);
    }
  }
  for (const check of guide.verification) {
    if (!cited.has(check.id)) {
      fail(null, `Verification "${check.id}" has no scene, so the work could not be judged.`);
    }
  }

  /* --- Safety comes first, and cannot be skipped ---------------------- */
  const firstProcedure = script.scenes.findIndex(
    (scene) => scene.kind === 'STEP' || scene.kind === 'PREPARATION',
  );
  const lastSafety = lastIndexOf(script.scenes, (scene) => scene.kind === 'SAFETY');

  if (lastSafety >= 0 && firstProcedure >= 0 && lastSafety > firstProcedure) {
    fail(
      null,
      'A safety scene appears after the procedure has started. Every hazard must be shown before the viewer is in a position to meet it.',
    );
  }

  for (const scene of script.scenes) {
    if (scene.kind === 'SAFETY' && !scene.mandatory) {
      fail(scene.id, 'Safety scene is skippable. Skipping to the useful bit is skipping the hazard.');
    }
  }

  /* --- Narration still says what the guide says ----------------------- */
  // A provider may rephrase. It may not quietly drop the control measure that
  // makes a hazard survivable, so the check is on the substance rather than
  // on an exact string.
  guide.safety.forEach((requirement, index) => {
    const id = safetyId(guide.id, index);
    const scene = script.scenes.find((candidate) => candidate.source.elementId === id);
    if (!scene) return;

    const spoken = `${scene.narration} ${scene.onScreenText.join(' ')}`.toLowerCase();
    const keywords = significantWords(requirement.control.toLowerCase());
    const kept = keywords.filter((word) => spoken.includes(word)).length;

    if (keywords.length > 0 && kept / keywords.length < 0.5) {
      fail(
        scene.id,
        `Safety scene no longer conveys the control measure from the guide ("${requirement.control.slice(0, 60)}…").`,
      );
    }
  });

  return violations;
}

/**
 * Words worth checking a paraphrase against.
 *
 * Common words are dropped: "the", "and" and "do" appear in any sentence and
 * would make the check pass on anything. What survives is the specific
 * vocabulary of the control measure — "disconnect", "negative", "terminal" —
 * which a genuine paraphrase keeps and a fabrication does not.
 */
function significantWords(text: string): string[] {
  const stop = new Set([
    'the', 'and', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'or', 'is', 'are',
    'be', 'do', 'not', 'it', 'its', 'with', 'for', 'from', 'this', 'that',
    'any', 'all', 'you', 'your', 'before', 'after', 'while', 'where', 'when',
  ]);

  return [...new Set(text.match(/[a-z]{4,}/g) ?? [])].filter((word) => !stop.has(word));
}

function lastIndexOf<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (predicate(items[i]!)) return i;
  }
  return -1;
}

/** Convenience for a provider: refuse to render a script that does not check out. */
export function isRenderable(script: VideoScript, guide: RepairGuide): boolean {
  return validateScript(script, guide).length === 0;
}

