import { Badge, Card, Meter } from '@/components/ui';
import {
  HEALTH_SYSTEM_LABELS,
  healthBand,
  type HealthReason,
  type SystemHealth,
  type VehicleHealth,
} from '@/domain/health';

/**
 * Vehicle health.
 *
 * Every score is shown with the reasons that produced it, always expanded.
 * Collapsing them would recreate exactly the thing the brief forbids — a
 * number the reader has to take on trust — and the reasons are more useful
 * than the score in any case.
 *
 * A system with no score is rendered as prominently as one with a score. An
 * unmeasured system quietly omitted would read as a system with nothing wrong.
 */

const BAND_TONE = {
  GOOD: 'ok',
  FAIR: 'warn',
  POOR: 'warn',
  CRITICAL: 'fault',
} as const;

const BAND_LABEL = {
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
  CRITICAL: 'Critical',
} as const;

export function HealthPanel({ health }: { health: VehicleHealth }) {
  return (
    <div className="flex flex-col gap-6">
      <OverallCard health={health} />

      <div className="flex flex-col gap-4">
        {health.systems.map((system) => (
          <SystemCard key={system.system} health={system} />
        ))}
      </div>
    </div>
  );
}

function OverallCard({ health }: { health: VehicleHealth }) {
  if (health.overall === null) {
    return (
      <Card>
        <p className="label-technical">Overall</p>
        <p className="mt-2 text-lg font-semibold tracking-tight">Not enough recorded yet</p>
        <p className="text-content-secondary mt-2 text-sm leading-relaxed text-pretty">
          Health is calculated from saved scans. Run a scan and save it to the vehicle&apos;s
          history, and a score will appear here with the evidence behind it.
        </p>
      </Card>
    );
  }

  const band = healthBand(health.overall);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="label-technical">Overall</p>
          <div className="mt-1.5 flex items-baseline gap-3">
            <span className="tabular text-3xl font-semibold tracking-tight">
              {health.overall}
            </span>
            <Badge tone={BAND_TONE[band]}>{BAND_LABEL[band]}</Badge>
          </div>
        </div>

        <div className="w-full sm:w-56">
          <Meter
            label="Overall vehicle health"
            hideLabel
            tone={BAND_TONE[band] === 'ok' ? 'ok' : BAND_TONE[band] === 'fault' ? 'fault' : 'warn'}
            value={health.overall}
            valueText={`${health.overall}/100`}
          />
        </div>
      </div>

      <p className="text-content-secondary mt-4 text-sm leading-relaxed text-pretty">
        The mean of the {health.assessedCount} system
        {health.assessedCount === 1 ? '' : 's'} that could be assessed. Systems with no data are
        excluded rather than counted as healthy — otherwise something nobody measured would move
        this number.
        {health.latestSessionAt && (
          <> Most recent scan: {formatDate(health.latestSessionAt)}.</>
        )}
      </p>
    </Card>
  );
}

function SystemCard({ health }: { health: SystemHealth }) {
  const assessed = health.score !== null;
  const band = assessed ? healthBand(health.score!) : null;

  return (
    <Card surface={assessed ? 'raised' : 'sunken'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">
            {HEALTH_SYSTEM_LABELS[health.system]}
          </h3>
          {assessed ? (
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="tabular text-xl font-semibold">{health.score}</span>
              <Badge tone={BAND_TONE[band!]}>{BAND_LABEL[band!]}</Badge>
              <span className="text-content-muted text-xs">
                from {health.sessionsConsidered} scan
                {health.sessionsConsidered === 1 ? '' : 's'}
              </span>
            </div>
          ) : (
            <div className="mt-1.5">
              <Badge tone="neutral">Not assessed</Badge>
            </div>
          )}
        </div>

        {assessed && (
          <div className="w-full shrink-0 sm:w-44">
            <Meter
              label={`${HEALTH_SYSTEM_LABELS[health.system]} health`}
              hideLabel
              tone={BAND_TONE[band!] === 'ok' ? 'ok' : BAND_TONE[band!] === 'fault' ? 'fault' : 'warn'}
              value={health.score!}
              valueText={`${health.score}/100`}
            />
          </div>
        )}
      </div>

      <ul className="border-line mt-4 flex flex-col gap-3 border-t pt-4">
        {health.reasons.map((reason, index) => (
          <ReasonRow key={`${reason.summary}-${index}`} reason={reason} />
        ))}
      </ul>
    </Card>
  );
}

function ReasonRow({ reason }: { reason: HealthReason }) {
  return (
    <li className="border-line border-l-2 pl-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-pretty">{reason.summary}</p>
        {reason.deduction > 0 && (
          <span className="tabular text-content-muted shrink-0 text-xs">
            −{reason.deduction}
          </span>
        )}
      </div>
      <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
        {reason.detail}
      </p>
      {reason.observedAt && (
        <p className="text-content-muted mt-1 text-xs">{formatDate(reason.observedAt)}</p>
      )}
    </li>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
