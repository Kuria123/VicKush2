import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPAIR_GUIDES, safetyId } from '../repair';

import { buildScript } from './script';
import type { Scene } from './types';
import { isRenderable, validateScript } from './validation';

/**
 * The video architecture.
 *
 * Two properties matter more than the rest, and both come straight from the
 * brief: video must not become a dependency of the diagnostic system, and AI
 * must not be able to invent a safety-critical procedure.
 */

const GUIDE = REPAIR_GUIDES[0]!;
const SCRIPT = buildScript(GUIDE);

/* ---------------------------------------------------------------------------
 * Not a dependency
 * ------------------------------------------------------------------------ */

describe('video is not a dependency of the diagnostic system', () => {
  /**
   * Walks the source of the core domains looking for an import of this folder.
   *
   * The arrow points one way: video reads the repair guides, and nothing reads
   * video. If that reverses, a broken or absent rendering backend starts being
   * able to break a diagnosis, which is exactly what the brief forbids.
   */
  function filesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) out.push(...filesUnder(path));
      else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path);
    }
    return out;
  }

  it('is imported by no core module', () => {
    const core = ['diagnostics', 'differential', 'confirmation', 'repair', 'simulation', 'telemetry'];
    const offenders: string[] = [];

    for (const area of core) {
      for (const file of filesUnder(join('src', 'domain', area))) {
        const source = readFileSync(file, 'utf8');
        if (/from\s+['"](\.\.\/video|@\/domain\/video)/.test(source)) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('reads the repair guides rather than the other way round', () => {
    // The dependency exists, and only in this direction.
    const source = readFileSync(join('src', 'domain', 'video', 'script.ts'), 'utf8');
    expect(source).toMatch(/from '\.\.\/repair'/);
  });
});

/* ---------------------------------------------------------------------------
 * Derivation, not generation
 * ------------------------------------------------------------------------ */

describe('a script is derived from the guide', () => {
  it('is deterministic', () => {
    // No model is involved, so the same guide always gives the same script.
    expect(JSON.stringify(buildScript(GUIDE))).toBe(JSON.stringify(buildScript(GUIDE)));
  });

  it('gives every scene a source that resolves to the guide', () => {
    for (const scene of SCRIPT.scenes) {
      expect(scene.source.guideId, scene.id).toBe(GUIDE.id);
      expect(scene.source.section, scene.id).toBe(scene.kind);
    }
  });

  it('covers every safety requirement, step and check', () => {
    expect(validateScript(SCRIPT, GUIDE)).toEqual([]);
    expect(isRenderable(SCRIPT, GUIDE)).toBe(true);
  });

  it('gives each hazard its own scene rather than one combined card', () => {
    // A single card listing four hazards is read as a formality.
    const safetyScenes = SCRIPT.scenes.filter((scene) => scene.kind === 'SAFETY');
    expect(safetyScenes).toHaveLength(GUIDE.safety.length);
  });

  it('validates every guide in the catalogue', () => {
    for (const guide of REPAIR_GUIDES) {
      expect(validateScript(buildScript(guide), guide), guide.id).toEqual([]);
    }
  });
});

/* ---------------------------------------------------------------------------
 * Safety cannot be skipped or lost
 * ------------------------------------------------------------------------ */

describe('safety', () => {
  it('puts every hazard before the first procedure scene', () => {
    const firstProcedure = SCRIPT.scenes.findIndex(
      (scene) => scene.kind === 'STEP' || scene.kind === 'PREPARATION',
    );
    const safetyIndexes = SCRIPT.scenes
      .map((scene, index) => (scene.kind === 'SAFETY' ? index : -1))
      .filter((index) => index >= 0);

    expect(safetyIndexes.length).toBeGreaterThan(0);
    expect(Math.max(...safetyIndexes)).toBeLessThan(firstProcedure);
  });

  it('marks every safety scene as unskippable', () => {
    for (const scene of SCRIPT.scenes) {
      if (scene.kind === 'SAFETY') expect(scene.mandatory, scene.id).toBe(true);
    }
  });

  it('rejects a script whose safety scene was made skippable', () => {
    const tampered = {
      ...SCRIPT,
      scenes: SCRIPT.scenes.map((scene) =>
        scene.kind === 'SAFETY' ? { ...scene, mandatory: false } : scene,
      ) as [Scene, ...Scene[]],
    };

    expect(validateScript(tampered, GUIDE).some((v) => /skippable/i.test(v.detail))).toBe(true);
  });

  it('rejects a script with a hazard dropped', () => {
    const tampered = {
      ...SCRIPT,
      scenes: SCRIPT.scenes.filter((scene) => scene.kind !== 'SAFETY') as [Scene, ...Scene[]],
    };

    const violations = validateScript(tampered, GUIDE);
    expect(violations.some((v) => /has no scene/i.test(v.detail))).toBe(true);
  });

  it('rejects safety moved after the procedure has started', () => {
    const safety = SCRIPT.scenes.filter((s) => s.kind === 'SAFETY');
    const rest = SCRIPT.scenes.filter((s) => s.kind !== 'SAFETY');
    const tampered = { ...SCRIPT, scenes: [...rest, ...safety] as [Scene, ...Scene[]] };

    expect(
      validateScript(tampered, GUIDE).some((v) => /after the procedure has started/i.test(v.detail)),
    ).toBe(true);
  });

  it('rejects narration that drops the control measure', () => {
    // The scene still exists and still cites its source. It just no longer
    // says what to do about the hazard — which is the part that matters.
    const id = safetyId(GUIDE.id, 0);
    const tampered = {
      ...SCRIPT,
      scenes: SCRIPT.scenes.map((scene) =>
        scene.source.elementId === id
          ? { ...scene, narration: 'Something to watch out for here.', onScreenText: [] }
          : scene,
      ) as [Scene, ...Scene[]],
    };

    expect(
      validateScript(tampered, GUIDE).some((v) => /no longer conveys the control measure/i.test(v.detail)),
    ).toBe(true);
  });

  it('allows a genuine paraphrase', () => {
    // A provider may adjust wording for delivery; it may not change substance.
    const id = safetyId(GUIDE.id, 0);
    const original = GUIDE.safety[0];
    const tampered = {
      ...SCRIPT,
      scenes: SCRIPT.scenes.map((scene) =>
        scene.source.elementId === id
          ? { ...scene, narration: `Careful here. ${original.control} ${original.hazard}` }
          : scene,
      ) as [Scene, ...Scene[]],
    };

    expect(validateScript(tampered, GUIDE)).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Invention is detectable
 * ------------------------------------------------------------------------ */

describe('an invented step is caught', () => {
  it('rejects a procedure scene with no matching step in the guide', () => {
    const invented: Scene = {
      id: 'invented',
      kind: 'STEP',
      heading: 'Step 99',
      narration: 'Disconnect the fuel rail and blow it through with compressed air.',
      onScreenText: [],
      visualBrief: '',
      mandatory: false,
      estimatedSeconds: 10,
      source: { guideId: GUIDE.id, section: 'STEP', elementId: 'step-that-does-not-exist' },
    };

    const tampered = { ...SCRIPT, scenes: [...SCRIPT.scenes, invented] as [Scene, ...Scene[]] };
    const violations = validateScript(tampered, GUIDE);

    expect(violations.some((v) => v.sceneId === 'invented')).toBe(true);
    expect(isRenderable(tampered, GUIDE)).toBe(false);
  });

  it('rejects a scene citing a different guide', () => {
    const other = REPAIR_GUIDES[1]!;
    expect(validateScript(buildScript(other), GUIDE).length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------------
 * Project rules
 * ------------------------------------------------------------------------ */

describe('project rules', () => {
  it('carries the guide’s limitations into the script itself', () => {
    // So they survive into whatever is produced from it.
    expect(SCRIPT.disclaimers.join(' ')).toMatch(/generic procedure, not one specific/i);
    const closing = SCRIPT.scenes[SCRIPT.scenes.length - 1]!;
    expect(closing.kind).toBe('LIMITATIONS');
    expect(closing.mandatory).toBe(true);
  });

  it('never implies the footage is of the viewer’s own vehicle', () => {
    const briefs = SCRIPT.scenes.map((scene) => scene.visualBrief).join(' ');
    expect(briefs).toMatch(/should be implied to be the viewer|differs by vehicle/i);
  });

  it('estimates a duration without claiming it is a rendered one', () => {
    expect(SCRIPT.estimatedSeconds).toBeGreaterThan(0);
    expect(SCRIPT.estimatedSeconds).toBe(
      SCRIPT.scenes.reduce((sum, scene) => sum + scene.estimatedSeconds, 0),
    );
  });
});
