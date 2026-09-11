'use client';

import { Readout, Sparkline } from '@/components/ui';
import {
  LIVE_SCAN_GROUPS,
  UNAVAILABLE_CAPABILITIES,
  trackValues,
  type ParameterTrack,
} from '@/domain/diagnostics';
import { getParameter } from '@/domain/telemetry';
import { cn } from '@/lib/utilities/cn';

/**
 * Every parameter a live scan requests, grouped as a technician reads them.
 *
 * A parameter that is not answering shows why. The `Readout` union makes it
 * impossible to render a value alongside a non-available state, so a stalled
 * sensor cannot appear as a stale number (Rule 1).
 */
export function ParameterGrid({ tracks }: { tracks: readonly ParameterTrack[] }) {
  const byId = new Map(tracks.map((track) => [track.parameterId, track]));

  return (
    <div className="flex flex-col gap-6">
      {LIVE_SCAN_GROUPS.map((group) => (
        <section key={group.id}>
          <h3 className="label-technical mb-3">{group.label}</h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {group.parameterIds.map((id) => (
              <ParameterTile key={id} parameterId={id} track={byId.get(id) ?? null} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <h3 className="label-technical mb-3">Not obtainable</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          {UNAVAILABLE_CAPABILITIES.map((capability) => (
            <div key={capability.label} className="min-w-0">
              <Readout label={capability.label} state="UNSUPPORTED" />
              <p className="text-content-muted mt-1.5 text-xs">{capability.reason}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ParameterTile({
  parameterId,
  track,
}: {
  parameterId: string;
  track: ParameterTrack | null;
}) {
  const definition = getParameter(parameterId);
  const label = definition?.shortName ?? parameterId;

  // Requested but not yet answered — the same state whether or not a scan is
  // running, since neither case has produced a reading.
  if (!track || track.samples === 0) {
    return <Readout label={label} state="NOT_READING" />;
  }

  if (track.state !== 'AVAILABLE' || track.latestValue === null) {
    return (
      <Readout label={label} state={track.state === 'AVAILABLE' ? 'UNAVAILABLE' : track.state} />
    );
  }

  const decimals = definition?.decimals ?? 1;
  const history = trackValues(track);

  return (
    <div className="min-w-0">
      <Readout
        label={label}
        value={track.latestValue.toFixed(decimals)}
        unit={track.unit ?? definition?.unit}
        live
      />
      {history.length > 1 && (
        <Sparkline
          values={history.slice(-60)}
          label={definition?.name ?? parameterId}
          unit={track.unit ?? undefined}
          className={cn('mt-2')}
          width={140}
          height={26}
          tone={toneFor(parameterId, track.latestValue)}
        />
      )}
    </div>
  );
}

/**
 * Colour carries meaning only where a value has a defensible normal range.
 * Everything else stays in the neutral telemetry hue rather than implying a
 * judgement the engine has not made — diagnosis is Stage 9's job, not this
 * screen's.
 */
function toneFor(parameterId: string, value: number): 'telemetry' | 'warn' | 'fault' {
  if (parameterId === 'SHORT_FUEL_TRIM_1' || parameterId === 'LONG_FUEL_TRIM_1') {
    const magnitude = Math.abs(value);
    if (magnitude > 20) return 'fault';
    if (magnitude > 10) return 'warn';
  }
  if (parameterId === 'COOLANT_TEMP') {
    if (value > 110) return 'fault';
    if (value > 100) return 'warn';
  }
  if (parameterId === 'CONTROL_MODULE_VOLTAGE') {
    if (value < 11.5 || value > 15.5) return 'fault';
    if (value < 13 || value > 15) return 'warn';
  }
  return 'telemetry';
}
