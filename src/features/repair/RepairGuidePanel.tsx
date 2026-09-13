'use client';

import { useState } from 'react';

import { Badge, Button, Card } from '@/components/ui';
import type { ConfirmedDifferential } from '@/domain/confirmation';
import {
  assessGuideEligibility,
  DIFFICULTY_LABELS,
  getGuideForCause,
  safetyId,
  type GuideStep,
  type RepairGuide,
  type SafetyRequirement,
  type SpecValue,
} from '@/domain/repair';

import { ScenePlan } from './ScenePlan';

/**
 * The repair guide.
 *
 * Two rules drive the layout.
 *
 * **Safety comes before the procedure, not after it.** It is rendered above
 * the steps and cannot be collapsed. A hazard the reader has to go looking for
 * is a hazard they meet for the first time while their hands are already in
 * the engine bay.
 *
 * **Nothing is shown until a cause is confirmed.** When it is not, this panel
 * says what is missing and what would unlock it, rather than hiding — a guide
 * that silently disappears teaches nothing about why.
 */

export interface RepairGuidePanelProps {
  differential: ConfirmedDifferential;
}

const SEVERITY_TONE = {
  DANGER: 'fault',
  WARNING: 'warn',
  CAUTION: 'accent',
} as const;

export function RepairGuidePanel({ differential }: RepairGuidePanelProps) {
  const eligibility = assessGuideEligibility(differential);
  const guide = eligibility.causeId ? getGuideForCause(eligibility.causeId) : undefined;

  if (eligibility.status !== 'ELIGIBLE' || !guide) {
    return (
      <Card surface="sunken">
        <p className="label-technical">Repair guide</p>
        <p className="mt-2 text-sm leading-relaxed text-pretty">{eligibility.reason}</p>
        {eligibility.unlockedBy && (
          <p className="text-content-secondary mt-3 text-sm leading-relaxed text-pretty">
            <span className="font-medium">What would unlock it:</span> {eligibility.unlockedBy}
          </p>
        )}
        {eligibility.status === 'ELIGIBLE' && !guide && (
          <p className="text-content-secondary mt-3 text-sm text-pretty">
            No procedure has been written for this cause yet.
          </p>
        )}
      </Card>
    );
  }

  return <Guide guide={guide} confirmation={eligibility.reason} />;
}

function Guide({ guide, confirmation }: { guide: RepairGuide; confirmation: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge technical>{guide.system}</Badge>
            <Badge tone="accent">{DIFFICULTY_LABELS[guide.difficulty]}</Badge>
          </div>
          <h3 className="text-base font-semibold tracking-tight text-balance">{guide.problem}</h3>
          <p className="text-content-secondary mt-2 text-sm leading-relaxed text-pretty">
            {confirmation}
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide procedure' : 'Show procedure'}
        </Button>
      </div>

      {/* Always visible, open or closed: this is what the guide assumes and
          what it does not know about your vehicle. */}
      <p className="border-line text-content-secondary mt-4 border-t pt-4 text-sm leading-relaxed text-pretty">
        {guide.vehicleApplicability}
      </p>

      {open && (
        <div className="mt-6 flex flex-col gap-6">
          <Section title="Safety" subtitle="Read before starting. Not optional.">
            <ul className="flex flex-col gap-3">
              {guide.safety.map((requirement, index) => (
                <SafetyRow
                  key={safetyId(guide.id, index)}
                  id={safetyId(guide.id, index)}
                  requirement={requirement}
                />
              ))}
            </ul>
          </Section>

          <Section title="What you will need">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="label-technical mb-2">Tools</p>
                <ul className="flex flex-col gap-2">
                  {guide.tools.map((tool) => (
                    <li key={tool.name} className="text-sm">
                      <span className="font-medium">{tool.name}</span>
                      {tool.specialist && (
                        <Badge tone="warn" className="ml-2">
                          Specialist
                        </Badge>
                      )}
                      <span className="text-content-secondary block text-pretty">
                        {tool.purpose}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="label-technical mb-2">Parts</p>
                <ul className="flex flex-col gap-2">
                  {guide.parts.map((part) => (
                    <li key={part.description} className="text-sm">
                      <span className="font-medium text-pretty">{part.description}</span>
                      <Badge tone="neutral" className="ml-2">
                        Only if needed
                      </Badge>
                      <Spec value={part.partNumber} label="Part number" />
                    </li>
                  ))}
                </ul>
                <p className="text-content-muted mt-3 text-xs text-pretty">
                  Nothing here is a recommendation to buy. Which part is needed — if any — is
                  settled by an inspection step, not by the scan.
                </p>
              </div>
            </div>

            <div className="border-line mt-4 border-t pt-3">
              <Spec value={guide.estimatedTime} label="Estimated time" />
            </div>
          </Section>

          <Section title="Preparation">
            <StepList steps={guide.preparation} guideId={guide.id} guide={guide} />
          </Section>

          <Section title="Procedure">
            <StepList steps={guide.steps} guideId={guide.id} guide={guide} />
          </Section>

          <Section title="Verification" subtitle="How to tell the work actually worked.">
            <ol className="flex flex-col gap-3">
              {guide.verification.map((check, index) => (
                <li key={check.id} className="border-line border-l-2 pl-3">
                  <p className="text-sm font-medium text-pretty">
                    {index + 1}. {check.check}
                  </p>
                  <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
                    <span className="font-medium">Pass:</span> {check.passCondition}
                  </p>
                </li>
              ))}
            </ol>
          </Section>

          <ScenePlan guide={guide} />

          <Card surface="sunken">
            <p className="label-technical">What this guide cannot tell you</p>
            <ul className="text-content-secondary mt-3 flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed">
              {guide.limitations.map((limitation) => (
                <li key={limitation} className="text-pretty">
                  {limitation}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Card>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      {subtitle && <p className="text-content-secondary mt-0.5 mb-3 text-xs">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

function SafetyRow({ id, requirement }: { id: string; requirement: SafetyRequirement }) {
  return (
    <li
      id={id}
      className="border-status-warn bg-status-warn-subtle rounded-md border px-3 py-2"
    >
      <Badge tone={SEVERITY_TONE[requirement.severity]}>{requirement.severity}</Badge>
      <p className="mt-1.5 text-sm font-medium text-pretty">{requirement.hazard}</p>
      <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
        {requirement.control}
      </p>
    </li>
  );
}

function StepList({
  steps,
  guideId,
  guide,
}: {
  steps: readonly GuideStep[];
  guideId: string;
  guide: RepairGuide;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step, index) => (
        <li key={step.id} className="border-line border-l-2 pl-3">
          <p className="text-sm font-medium text-pretty">
            {index + 1}. {step.instruction}
          </p>
          <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
            {step.rationale}
          </p>

          {step.safetyRefs.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {step.safetyRefs.map((ref) => {
                const index = Number(ref.replace(`${guideId}-safety-`, '')) - 1;
                const requirement = guide.safety[index];
                return (
                  <a
                    key={ref}
                    href={`#${ref}`}
                    className="text-status-warn text-xs font-medium hover:underline"
                  >
                    ⚠ {requirement ? requirement.severity : 'Safety'}
                  </a>
                );
              })}
            </p>
          )}

          {step.specification && <Spec value={step.specification} label="Specification" />}

          {step.expectedOutcome && (
            <p className="text-content-muted mt-1 text-xs text-pretty">
              Expect: {step.expectedOutcome}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * A value that is only meaningful with authoritative service data.
 *
 * The unknown case renders the reason, never a blank or a dash. A blank reads
 * as "nothing to say here"; the reason says why there is nothing to say.
 */
function Spec({ value, label }: { value: SpecValue; label: string }) {
  if (value.known) {
    return (
      <p className="text-content-secondary mt-1 text-xs">
        <span className="font-medium">{label}:</span> {value.value}{' '}
        <span className="text-content-muted">({value.source})</span>
      </p>
    );
  }

  return (
    <p className="text-content-muted mt-1 text-xs text-pretty">
      <span className="font-medium">{label}: not available.</span> Requires {value.requires}
    </p>
  );
}
