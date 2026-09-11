import { REPAIR_GUIDES } from './guides';
import { safetyId, type RepairGuide } from './types';

/**
 * Structural checks every guide must pass.
 *
 * The brief says generic instructions must not bypass safety checks. The type
 * system does part of that — `safety`, `steps` and `verification` are non-empty
 * tuples, so a guide missing any of them cannot be constructed. The rest is
 * here, because some rules are about relationships between fields rather than
 * about a field existing:
 *
 * - A step may not reference a safety requirement that does not exist. A
 *   mistyped id would silently produce a step whose hazard is never shown.
 * - A `DANGER` hazard must be referenced by at least one step. A warning
 *   nothing points at is a warning nobody reads at the moment it matters.
 * - A part may not be marked as determined by a step that does not exist, and
 *   a part that is not `CONDITIONAL` must say which step confirmed it.
 *
 * These run as tests over the whole catalogue rather than at runtime. A guide
 * is authored data, so a malformed one is a build-time mistake, and failing
 * the suite is the right place to catch it.
 */

export interface GuideViolation {
  guideId: string;
  detail: string;
}

export function validateGuide(guide: RepairGuide): GuideViolation[] {
  const violations: GuideViolation[] = [];
  const fail = (detail: string) => violations.push({ guideId: guide.id, detail });

  const safetyIds = new Set(guide.safety.map((_, index) => safetyId(guide.id, index)));
  const allSteps = [...guide.preparation, ...guide.steps];
  const stepIds = new Set(allSteps.map((step) => step.id));

  /* --- Safety references resolve ------------------------------------- */
  for (const step of allSteps) {
    for (const ref of step.safetyRefs) {
      if (!safetyIds.has(ref)) {
        fail(`Step "${step.id}" references safety requirement "${ref}", which does not exist.`);
      }
    }
  }

  /* --- Every DANGER is pointed at ------------------------------------ */
  const referenced = new Set(allSteps.flatMap((step) => step.safetyRefs));
  guide.safety.forEach((requirement, index) => {
    if (requirement.severity !== 'DANGER') return;
    const id = safetyId(guide.id, index);
    if (!referenced.has(id)) {
      fail(
        `DANGER hazard "${requirement.hazard.slice(0, 48)}…" is not referenced by any step, so it would never be shown at the moment it applies.`,
      );
    }
  });

  /* --- Hazards are specific ------------------------------------------ */
  for (const requirement of guide.safety) {
    if (requirement.control.trim().length < 20) {
      fail(`A safety control is too short to be actionable: "${requirement.control}".`);
    }
    if (/^\s*(be careful|take care|use caution)\.?\s*$/i.test(requirement.control)) {
      fail('A safety control says "be careful", which instructs nothing.');
    }
  }

  /* --- Parts point at the step that settles them --------------------- */
  for (const part of guide.parts) {
    if (part.determinedByStep !== null && !stepIds.has(part.determinedByStep)) {
      fail(
        `Part "${part.description.slice(0, 40)}…" is determined by step "${part.determinedByStep}", which does not exist.`,
      );
    }
    if (part.necessity === 'CONFIRMED_BY_STEP' && part.determinedByStep === null) {
      fail(
        `Part "${part.description.slice(0, 40)}…" claims to be confirmed by a step but names none.`,
      );
    }
  }

  /* --- Steps are unique and explained -------------------------------- */
  if (stepIds.size !== allSteps.length) {
    fail('Two steps share an id, so a part or safety reference could resolve to either.');
  }
  for (const step of allSteps) {
    if (step.rationale.trim().length < 20) {
      fail(`Step "${step.id}" has no meaningful rationale, so it would be followed blindly.`);
    }
  }

  /* --- Verification is measurable ------------------------------------ */
  for (const check of guide.verification) {
    if (check.passCondition.trim().length < 20) {
      fail(`Verification "${check.id}" has no stated pass condition.`);
    }
  }

  return violations;
}

export function validateCatalogue(): GuideViolation[] {
  return REPAIR_GUIDES.flatMap(validateGuide);
}
