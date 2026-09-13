'use client';

import { useState } from 'react';

import { Badge, Button, Card } from '@/components/ui';
import type { RepairGuide } from '@/domain/repair';
import { buildScript } from '@/domain/video';

/**
 * The scene plan a video would be rendered from.
 *
 * Shown rather than hidden, because it is the honest state of this feature: a
 * plan exists, no rendering backend is configured, and nothing has been
 * produced. The obvious alternative — stock footage of somebody else's engine
 * bay, captioned as your repair — would be worse than showing nothing, since a
 * viewer following a different vehicle's layout is being actively misled about
 * where components are.
 *
 * The plan is derived from the guide on the client, deterministically. There
 * is no request, because there is nothing to ask for.
 */
export function ScenePlan({ guide }: { guide: RepairGuide }) {
  const [open, setOpen] = useState(false);
  const script = buildScript(guide);

  return (
    <Card surface="sunken">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-technical">Video walkthrough</p>
          <p className="text-content-secondary mt-1 text-sm text-pretty">
            No video provider is configured, so nothing has been rendered. The written procedure
            above is complete without one.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide scene plan' : 'Show scene plan'}
        </Button>
      </div>

      {open && (
        <div className="mt-4">
          <p className="text-content-secondary mb-3 text-sm leading-relaxed text-pretty">
            {script.scenes.length} scenes, roughly {Math.round(script.estimatedSeconds / 60)}{' '}
            {Math.round(script.estimatedSeconds / 60) === 1 ? 'minute' : 'minutes'}. Every scene is
            derived from the procedure above — no part of it is written by a model, and a scene
            that could not name the step it came from would be rejected before rendering.
          </p>

          <ol className="flex flex-col gap-2">
            {script.scenes.map((scene, index) => (
              <li key={scene.id} className="border-line border-l-2 pl-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="tabular text-content-muted text-xs">{index + 1}</span>
                  <Badge technical>{scene.kind.toLowerCase().replace(/_/g, ' ')}</Badge>
                  {scene.mandatory && <Badge tone="warn">Cannot be skipped</Badge>}
                  <span className="text-sm font-medium text-pretty">{scene.heading}</span>
                </div>
                <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
                  {scene.narration}
                </p>
              </li>
            ))}
          </ol>

          <div className="border-line mt-4 border-t pt-3">
            <p className="label-technical">Stated in any video produced from this</p>
            <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
              {script.disclaimers.map((disclaimer) => (
                <li key={disclaimer} className="text-pretty">
                  {disclaimer}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
