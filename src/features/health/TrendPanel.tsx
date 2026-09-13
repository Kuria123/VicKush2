import { Badge, Card } from '@/components/ui';
import { HEALTH_SYSTEM_LABELS } from '@/domain/health';
import {
  SIGNAL_STRENGTH_LABELS,
  type PredictiveReport,
  type PredictiveSignal,
} from '@/domain/prediction';

/**
 * What is trending, across a vehicle's saved scans.
 *
 * Every signal shows what it is *not* claiming, immediately under what it is.
 * That is unusual, and deliberate: the likeliest way this panel does harm is a
 * reader finishing the sentence themselves — "voltage declining" becoming "the
 * battery is failing" — and the cheapest defence is to finish it for them,
 * in the same breath rather than in a footnote nobody reaches.
 */

const STRENGTH_TONE = {
  STRONG: 'warn',
  MODERATE: 'accent',
  WEAK: 'neutral',
} as const;

export function TrendPanel({ report }: { report: PredictiveReport }) {
  if (report.signals.length === 0) {
    return (
      <Card surface="sunken">
        <p className="label-technical">What is trending</p>
        <p className="mt-2 text-sm leading-relaxed text-pretty">
          {report.scansConsidered < 3
            ? `Nothing can be said about direction yet. This vehicle has ${report.scansConsidered} saved ${report.scansConsidered === 1 ? 'scan' : 'scans'}, and a direction needs at least three to be distinguishable from ordinary variation.`
            : 'No direction was found across the scans on record.'}
        </p>
        <Limitations report={report} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">What is trending</h3>
        <p className="text-content-secondary mt-1 text-sm text-pretty">
          Directions observed across {report.scansConsidered} saved scans
          {report.spanDays !== null && report.spanDays > 0 && <> over {report.spanDays} days</>}.
        </p>
      </div>

      {report.signals.map((signal) => (
        <SignalCard key={signal.id} signal={signal} />
      ))}

      <Card surface="sunken">
        <Limitations report={report} />
      </Card>
    </div>
  );
}

function SignalCard({ signal }: { signal: PredictiveSignal }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {signal.system && <Badge technical>{HEALTH_SYSTEM_LABELS[signal.system]}</Badge>}
            <Badge tone={STRENGTH_TONE[signal.strength]}>
              {SIGNAL_STRENGTH_LABELS[signal.strength]}
            </Badge>
            <span className="text-content-muted text-xs">
              from {signal.scansConsidered} scans
            </span>
          </div>
          <h4 className="text-base font-semibold tracking-tight text-balance">
            {signal.headline}
          </h4>
        </div>
      </div>

      <p className="text-content-secondary mt-2 text-sm leading-relaxed text-pretty">
        {signal.detail}
      </p>

      {/* Directly beneath the claim, not in a footnote. */}
      <p className="border-line text-content-secondary mt-3 border-l-2 pl-3 text-sm leading-relaxed text-pretty">
        <span className="text-content font-medium">What this does not say: </span>
        {signal.notClaiming}
      </p>

      <p className="text-content-secondary mt-3 text-sm leading-relaxed text-pretty">
        <span className="text-content font-medium">What would establish more: </span>
        {signal.suggestedCheck}
      </p>
    </Card>
  );
}

function Limitations({ report }: { report: PredictiveReport }) {
  return (
    <>
      <p className="label-technical">Limits of these observations</p>
      <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
        {report.limitations.map((limitation) => (
          <li key={limitation} className="text-pretty">
            {limitation}
          </li>
        ))}
      </ul>
    </>
  );
}
