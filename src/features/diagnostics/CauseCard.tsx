'use client';

import { useId, useState } from 'react';

import { Badge, Card, Meter } from '@/components/ui';
import { SYSTEM_LABELS } from '@/domain/diagnostics';
import type { Contribution, RankedCause } from '@/domain/differential';

/**
 * One candidate cause, with everything behind its position.
 *
 * The contributions are the whole point of the card. A ranking a user cannot
 * interrogate is just a number with a label, and the project's answer to
 * "how confident are we" is not a percentage — it is the list of observations
 * that produced it, each with the reason it counted.
 */

export interface CauseCardProps {
  cause: RankedCause;
  /** Marks the best-fitting cause when one clearly leads. */
  leading?: boolean;
}

export function CauseCard({ cause, leading = false }: CauseCardProps) {
  const [open, setOpen] = useState(leading);
  const detailId = useId();

  const excluded = cause.status === 'RULED_OUT';
  const tone = excluded ? 'fault' : leading ? 'accent' : 'warn';

  return (
    <Card surface={excluded ? 'sunken' : 'raised'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge technical>{SYSTEM_LABELS[cause.system]}</Badge>
            {leading && <Badge tone="accent">Best fit</Badge>}
            {excluded && <Badge tone="fault">Ruled out</Badge>}
            {!excluded && !cause.keyObservationMade && (
              <Badge tone="warn">Key check not done</Badge>
            )}
          </div>
          <h4 className="text-base font-semibold tracking-tight text-balance">{cause.label}</h4>
        </div>

        {!excluded && (
          <div className="w-full shrink-0 sm:w-44">
            <Meter
              label={`Evidence fit for ${cause.label}`}
              hideLabel
              tone={tone === 'accent' ? 'accent' : 'warn'}
              value={cause.confidence}
              valueText={`${cause.confidence}%`}
            />
            <p className="text-content-muted mt-1 text-right text-xs">
              {cause.points.earned} of {cause.points.available} points of evidence
            </p>
          </div>
        )}
      </div>

      <p className="text-content-secondary mt-3 text-sm leading-relaxed">{cause.mechanism}</p>

      {/* Exclusions are never collapsed: why something was dismissed is the
          part a user most needs to be able to disagree with. */}
      {excluded && (
        <ul className="mt-4 flex flex-col gap-3">
          {cause.exclusions.map((item, index) => (
            <EvidenceRow key={`${item.evidenceId}-${index}`} item={item} kind="against" />
          ))}
        </ul>
      )}

      {!excluded && (cause.contributions.length > 0 || cause.unmet.length > 0) && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailId}
            className="text-accent mt-4 text-sm font-medium hover:underline"
          >
            {open ? 'Hide the evidence' : `Show the evidence (${cause.contributions.length})`}
          </button>

          <div id={detailId} hidden={!open} className="mt-4">
            {cause.contributions.length > 0 && (
              <ul className="flex flex-col gap-3">
                {cause.contributions.map((item, index) => (
                  <EvidenceRow key={`${item.evidenceId}-${index}`} item={item} kind="for" />
                ))}
              </ul>
            )}

            {cause.unmet.length > 0 && (
              <div className="border-line mt-4 border-t pt-3">
                <p className="label-technical">Expected but not observed</p>
                <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm">
                  {cause.unmet.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function EvidenceRow({ item, kind }: { item: Contribution; kind: 'for' | 'against' }) {
  return (
    <li className="border-line border-l-2 pl-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-pretty">{item.observation}</p>
        {kind === 'for' && item.points > 0 && (
          <span className="tabular text-content-muted text-xs">+{item.points}</span>
        )}
      </div>
      <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
        {item.reason}
      </p>
    </li>
  );
}
