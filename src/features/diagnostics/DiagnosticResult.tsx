'use client';

import type { ReactNode } from 'react';

import { Badge, Button, Card, EmptyState, SimulationBanner, Table } from '@/components/ui';
import type { ConfirmedDifferential, TestOutcome, TestResult } from '@/domain/confirmation';
import {
  SEVERITY_LABELS,
  SYSTEM_LABELS,
  type DiagnosticAnalysis,
  type Finding,
  type FindingSeverity,
} from '@/domain/diagnostics';
import type { DifferentialVerdict } from '@/domain/differential';
import { describeDtcStructure, parseDtc } from '@/domain/telemetry';

import { CauseCard } from './CauseCard';
import { TestPanel } from './TestPanel';

/**
 * The diagnostic result experience.
 *
 * Laid out as the six questions the spec asks, in that order, because that is
 * the order a person actually asks them. Each section answers exactly one.
 *
 * The hardest thing this screen has to do is present an honest "how confident
 * are we". The answer is never a single number: it is a verdict about whether
 * the evidence separates the candidates at all, and when it does not, the
 * screen says so plainly and puts the test that would settle it next. A
 * product that always produces a confident-looking answer would be easier to
 * build and worth considerably less.
 */

export interface DiagnosticResultProps {
  analysis: DiagnosticAnalysis | null;
  differential: ConfirmedDifferential | null;
  results: readonly TestResult[];
  isSimulated: boolean;
  onRecordResult: (testId: string, outcome: TestOutcome, note?: string) => void;
  onClearResult: (testId: string) => void;
  onClearAllResults: () => void;
  /** Rendered when there is no session to analyse. */
  emptyAction?: ReactNode;
}

const VERDICT_COPY: Record<DifferentialVerdict, { title: string; body: string }> = {
  SINGLE_LEADING: {
    title: 'One cause fits the evidence best',
    body: 'The observations point more clearly at one mechanism than at the others. It is still a ranking over evidence, not a confirmed fault — the test below is what would confirm it.',
  },
  AMBIGUOUS: {
    title: 'The evidence does not separate these causes',
    body: 'More than one mechanism explains these readings equally well. Naming one would be a guess. The test below is the observation that would actually tell them apart.',
  },
  INSUFFICIENT: {
    title: 'Not enough to name a cause',
    body: 'Nothing in this scan matched a mechanism the engine can argue for. That is not the same as the vehicle being healthy — see what could not be checked, below.',
  },
};

export function DiagnosticResult({
  analysis,
  differential,
  results,
  isSimulated,
  onRecordResult,
  onClearResult,
  onClearAllResults,
  emptyAction,
}: DiagnosticResultProps) {
  if (!analysis || !differential) {
    return (
      <Card>
        <EmptyState
          eyebrow="No session"
          title="Run a scan first"
          description="A diagnosis is produced from recorded readings. Nothing is inferred without them."
          action={emptyAction}
        />
      </Card>
    );
  }

  if (analysis.sampleCount === 0) {
    return (
      <Card>
        <EmptyState
          eyebrow="No samples"
          title="Nothing was recorded"
          description="The session exists but holds no readings, so there is nothing to interpret."
          action={emptyAction}
        />
      </Card>
    );
  }

  const supported = differential.causes.filter((c) => c.status === 'SUPPORTED');
  const leading = differential.verdict === 'SINGLE_LEADING' ? supported[0] : undefined;
  const others = supported.filter((c) => c.id !== leading?.id);
  const verdict = VERDICT_COPY[differential.verdict];

  return (
    <div className="flex flex-col gap-8">
      <SimulationBanner isSimulated={isSimulated} />

      {/* --- What happened? ------------------------------------------- */}
      <Section
        title="What happened"
        description={`${analysis.sampleCount.toLocaleString()} samples across ${analysis.conditionsObserved.length} operating ${analysis.conditionsObserved.length === 1 ? 'condition' : 'conditions'}.`}
      >
        {analysis.findings.length === 0 ? (
          <Card>
            <p className="text-content-secondary text-sm">
              No finding was raised from these readings.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {analysis.findings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </div>
        )}
      </Section>

      {/* --- Why? / How confident? ------------------------------------ */}
      <Section title="Why, and how confident" description={verdict.title}>
        <Card surface="sunken">
          <p className="text-sm leading-relaxed text-pretty">{verdict.body}</p>
        </Card>

        {leading && (
          <div className="mt-4">
            <CauseCard cause={leading} leading />
          </div>
        )}

        {!leading && supported.length > 0 && (
          <div className="mt-4 flex flex-col gap-4">
            {supported.map((cause) => (
              <CauseCard key={cause.id} cause={cause} />
            ))}
          </div>
        )}
      </Section>

      {/* --- What else could cause it? -------------------------------- */}
      <Section
        title="What else could cause it"
        description="Everything else the engine considered, including what it dismissed and why."
      >
        {others.length === 0 && differential.ruledOut.length === 0 ? (
          <Card>
            <p className="text-content-secondary text-sm">
              No other mechanism in the catalogue applied to these readings.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {others.map((cause) => (
              <CauseCard key={cause.id} cause={cause} />
            ))}
            {differential.ruledOut.map((cause) => (
              <CauseCard key={cause.id} cause={cause} />
            ))}
          </div>
        )}
      </Section>

      {/* --- What should I test? -------------------------------------- */}
      <Section
        title="What should I test"
        description="Observations that would settle what the scan could not. None asks for a component to be fitted."
        actions={
          results.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={onClearAllResults}>
              Clear results
            </Button>
          ) : undefined
        }
      >
        <TestPanel
          recommended={differential.recommended}
          results={results}
          onRecord={onRecordResult}
          onClear={onClearResult}
        />
      </Section>

      {/* --- What should I do next? ----------------------------------- */}
      <Section
        title="What should I do next"
        description="What this scan could not establish, stated rather than left out."
      >
        {differential.nextSteps.length > 0 && (
          <ul className="mb-4 flex flex-col gap-3">
            {differential.nextSteps.map((step) => (
              <li key={step.id}>
                <Card>
                  <p className="text-sm font-medium text-pretty">{step.action}</p>
                  <p className="text-content-secondary mt-1.5 text-sm leading-relaxed text-pretty">
                    {step.because}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <Card surface="sunken">
          <p className="label-technical">Limits of this diagnosis</p>
          <ul className="text-content-secondary mt-3 flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed">
            {differential.limitations.map((limitation) => (
              <li key={limitation} className="text-pretty">
                {limitation}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <DtcSection analysis={analysis} />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Pieces
 * ---------------------------------------------------------------------- */

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          {description && (
            <p className="text-content-secondary mt-1 text-sm text-pretty">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const SEVERITY_TONE: Record<FindingSeverity, 'fault' | 'warn' | 'accent' | 'neutral'> = {
  SEVERE: 'fault',
  SIGNIFICANT: 'warn',
  ADVISORY: 'accent',
  INFO: 'neutral',
};

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[finding.severity]}>
              {SEVERITY_LABELS[finding.severity]}
            </Badge>
            <Badge technical>{SYSTEM_LABELS[finding.system]}</Badge>
          </div>
          <h4 className="text-base font-semibold tracking-tight text-balance">{finding.title}</h4>
        </div>
      </div>

      {finding.supporting.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {finding.supporting.map((item) => (
            <li key={item.id} className="text-content-secondary text-sm leading-relaxed">
              {item.summary}
            </li>
          ))}
        </ul>
      )}

      {finding.opposing.length > 0 && (
        <div className="border-line mt-3 border-t pt-3">
          <p className="label-technical">Arguing against</p>
          <ul className="text-content-secondary mt-2 flex flex-col gap-2 text-sm leading-relaxed">
            {finding.opposing.map((item) => (
              <li key={item.id}>{item.summary}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function DtcSection({ analysis }: { analysis: DiagnosticAnalysis }) {
  const codes = analysis.evidence.filter((e) => e.kind === 'DTC');
  if (codes.length === 0) return null;

  return (
    <Section
      title="Fault codes"
      description="Reported alongside the diagnosis. They are not interpreted, and they awarded no points to any cause."
    >
      <Card>
        <Table
          caption="Fault codes recorded during this session"
          rowKey={(row) => row.id}
          rows={[...codes]}
          columns={[
            {
              key: 'code',
              header: 'Code',
              render: (row) => {
                const code = row.id.replace(/^dtc-/, '');
                return <Badge technical>{code}</Badge>;
              },
            },
            {
              key: 'structure',
              header: 'Structure',
              render: (row) => {
                const parsed = parseDtc(row.id.replace(/^dtc-/, ''));
                return (
                  <span className="text-content-secondary text-xs">
                    {parsed ? describeDtcStructure(parsed) : 'Unrecognised format'}
                  </span>
                );
              },
            },
            {
              key: 'summary',
              header: 'Observed',
              render: (row) => (
                <span className="text-content-secondary text-sm">{row.summary}</span>
              ),
            },
          ]}
        />
      </Card>
    </Section>
  );
}
