'use client';

import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  SimulationBanner,
  StatusIndicator,
  Table,
  Tabs,
} from '@/components/ui';
import { FEATURED_TREND_PARAMETERS } from '@/domain/diagnostics';
import { getParameter, parseDtc, describeDtcStructure } from '@/domain/telemetry';
import { SimulationControls } from '@/features/connection/SimulationControls';
import { useVehicleConnection } from '@/features/connection/useVehicleConnection';
import { DiagnosisTab } from '@/features/diagnostics/DiagnosisTab';

import { ParameterGrid } from './ParameterGrid';
import { TrendChart, type TrendTone } from './TrendChart';
import { useLiveScan } from './useLiveScan';

const TREND_TONES: Record<string, TrendTone> = {
  ENGINE_RPM: 'telemetry',
  SHORT_FUEL_TRIM_1: 'warn',
  LONG_FUEL_TRIM_1: 'warn',
  MAF_RATE: 'accent',
};

export interface LiveScanPanelProps {
  vehicleName: string;
  /** From the vehicle record. Absent facts limit what the diagnosis can check. */
  engineDisplacementCc?: number | null;
}

export function LiveScanPanel({ vehicleName, engineDisplacementCc = null }: LiveScanPanelProps) {
  const connection = useVehicleConnection();
  const [throttleHint, setThrottleHint] = useState(false);

  const scan = useLiveScan({
    provider: connection.provider,
    scenario: connection.activeScenario,
  });

  const byId = new Map(scan.tracks.map((track) => [track.parameterId, track]));
  const summary = scan.summary;

  return (
    <div className="flex flex-col gap-6">
      {/* Outside the tabs: the disclosure must be visible whichever is open. */}
      <SimulationBanner isSimulated={connection.isSimulated} />

      <Tabs
        items={[
          {
            value: 'scan',
            label: 'Live scan',
            content: (
              <ScanTab
                connection={connection}
                scan={scan}
                byId={byId}
                summary={summary}
                throttleHint={throttleHint}
                setThrottleHint={setThrottleHint}
                vehicleName={vehicleName}
              />
            ),
          },
          {
            value: 'diagnosis',
            label: 'Diagnosis',
            content: (
              <DiagnosisTab
                session={scan.session}
                scanning={scan.scanning}
                sampleCount={summary?.sampleCount ?? 0}
                isSimulated={connection.isSimulated}
                engineDisplacementCc={engineDisplacementCc}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

type Connection = ReturnType<typeof useVehicleConnection>;
type Scan = ReturnType<typeof useLiveScan>;

function ScanTab({
  connection,
  scan,
  byId,
  summary,
  throttleHint,
  setThrottleHint,
  vehicleName,
}: {
  connection: Connection;
  scan: Scan;
  byId: Map<string, Scan['tracks'][number]>;
  summary: Scan['summary'];
  throttleHint: boolean;
  setThrottleHint: (fn: (v: boolean) => boolean) => void;
  vehicleName: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label-technical">Live scan</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <StatusIndicator
                tone={scan.scanning ? 'live' : connection.ready ? 'idle' : 'idle'}
                label={
                  scan.scanning
                    ? 'Streaming'
                    : connection.ready
                      ? 'Connected, not scanning'
                      : 'Not connected'
                }
                pulse={scan.scanning}
              />
              {scan.actualIntervalMs && scan.scanning && (
                <Badge technical>{(1000 / scan.actualIntervalMs).toFixed(0)} Hz</Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {!connection.ready && (
              <Button onClick={connection.connect} loading={connection.running}>
                {connection.running ? 'Connecting…' : 'Connect'}
              </Button>
            )}
            {connection.ready && !scan.scanning && <Button onClick={scan.start}>Start scan</Button>}
            {scan.scanning && (
              <Button variant="secondary" onClick={scan.stop}>
                Stop
              </Button>
            )}
            {summary && !scan.scanning && summary.sampleCount > 0 && (
              <Button variant="ghost" onClick={scan.reset}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {scan.error && (
          <p
            role="alert"
            className="border-status-fault bg-status-fault-subtle text-status-fault mt-4 rounded-md border px-3 py-2 text-sm"
          >
            {scan.error.message}
          </p>
        )}

        {summary && summary.sampleCount > 0 && (
          <dl className="border-line mt-5 grid gap-5 border-t pt-4 sm:grid-cols-4">
            <Stat label="Samples" value={summary.sampleCount.toLocaleString()} />
            <Stat label="Duration" value={`${(summary.durationMs / 1000).toFixed(0)} s`} />
            <Stat label="Reading" value={`${summary.readingParameters} parameters`} />
            <Stat label="Unsupported" value={`${summary.unsupportedParameters} parameters`} />
          </dl>
        )}
      </Card>

      {!connection.ready ? (
        <Card>
          <EmptyState
            eyebrow="Not connected"
            title="Connect before scanning"
            description="Live values come from the vehicle data provider. Nothing is shown until there is something real to show."
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="label-technical">Trends</p>
              {connection.isSimulated && (
                <Button size="sm" variant="ghost" onClick={() => setThrottleHint((v) => !v)}>
                  {throttleHint ? 'Hide tip' : 'How to see the signature'}
                </Button>
              )}
            </div>

            {throttleHint && (
              <p className="border-line text-content-secondary mb-5 rounded-md border px-3 py-2 text-sm">
                Select the <strong>Vacuum leak</strong> scenario below and watch the fuel trims
                climb at idle. The trims are proportional to how much unmetered air the leak admits,
                so they fall again as airflow rises — that difference between idle and load is what
                separates a leak from a fuel or sensor fault.
              </p>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {FEATURED_TREND_PARAMETERS.map((id) => {
                const track = byId.get(id);
                const definition = getParameter(id);
                return (
                  <div key={id} className="min-w-0">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <h4 className="text-sm font-medium">{definition?.name ?? id}</h4>
                      <span className="tabular text-content-secondary text-sm">
                        {track?.state === 'AVAILABLE' && track.latestValue !== null
                          ? `${track.latestValue.toFixed(definition?.decimals ?? 1)} ${track.unit ?? ''}`
                          : '—'}
                      </span>
                    </div>
                    {track ? (
                      <TrendChart track={track} tone={TREND_TONES[id] ?? 'telemetry'} />
                    ) : (
                      <p className="text-content-muted text-xs">Not yet sampled.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <p className="label-technical mb-4">Parameters</p>
            <ParameterGrid tracks={scan.tracks} />
          </Card>

          <DtcCard session={scan.session} />
        </>
      )}

      {connection.isSimulated && (
        <SimulationControls
          scenarios={connection.scenarios}
          activeScenario={connection.activeScenario}
          onScenarioChange={connection.setScenario}
          onInjectDtc={connection.injectDtc}
          onClearFaults={connection.clearFaults}
          onThrottleChange={connection.setThrottle ?? undefined}
          disabled={!connection.ready}
        />
      )}

      <p className="text-content-muted text-xs">
        Scanning {vehicleName}. Nothing on this screen is saved yet — sessions are persisted from
        Stage 15. Stop the scan and open the Diagnosis tab to interpret these readings.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-technical">{label}</dt>
      <dd className="tabular mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function DtcCard({ session }: { session: ReturnType<typeof useLiveScan>['session'] }) {
  const dtcs = session?.allDtcs() ?? [];

  return (
    <Card>
      <p className="label-technical mb-4">Fault codes</p>
      {dtcs.length === 0 ? (
        <p className="text-content-secondary text-sm">No fault codes reported.</p>
      ) : (
        <Table
          caption="Fault codes reported by the vehicle"
          rowKey={(row) => row.code}
          rows={[...dtcs]}
          columns={[
            {
              key: 'code',
              header: 'Code',
              render: (row) => <Badge technical>{row.code}</Badge>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <Badge tone={row.status === 'STORED' ? 'fault' : 'warn'}>
                  {row.status === 'STORED' ? 'Stored' : 'Pending'}
                </Badge>
              ),
            },
            {
              key: 'structure',
              header: 'Structure',
              render: (row) => {
                const parsed = parseDtc(row.code);
                return (
                  <span className="text-content-secondary text-xs">
                    {parsed ? describeDtcStructure(parsed) : 'Unrecognised format'}
                  </span>
                );
              },
            },
          ]}
        />
      )}

      <p className="text-content-muted mt-4 text-xs">
        Only the code and what its structure encodes are shown. What each fault means needs an
        authoritative table this build does not have, and guessing would be worse than saying
        nothing.
      </p>
    </Card>
  );
}
