'use client';

import { Button, Card, EmptyState, SimulationBanner } from '@/components/ui';
import { getProfile } from '@/domain/hardware';

import { CompatibilityPanel } from './CompatibilityPanel';

import { ConnectionSequence, ConnectionStatus } from './ConnectionSequence';
import { SimulationControls } from './SimulationControls';
import { useVehicleConnection } from './useVehicleConnection';

export function ConnectionPanel({ vehicleName }: { vehicleName: string }) {
  const connection = useVehicleConnection();
  const { phases, ready, running, summary, isSimulated, providerName, transport } = connection;

  const started = running || ready || phases.some((p) => p.status !== 'PENDING');
  const failed = phases.some((p) => p.status === 'FAILED');

  return (
    <div className="flex flex-col gap-6">
      {/* Shown as soon as a simulated provider is selected, not only once the
          connection succeeds — the disclosure must precede the data. */}
      <SimulationBanner isSimulated={isSimulated} />

      <Card>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-technical">Connection</p>
            <p className="mt-1.5 text-lg font-semibold tracking-tight">
              {providerName ?? 'No adapter selected'}
            </p>
            {transport && (
              <p className="text-content-secondary mt-0.5 text-sm">
                {transport.toLowerCase()} transport
              </p>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            {!ready && (
              <Button onClick={connection.connect} loading={running}>
                {running ? 'Connecting…' : started ? 'Retry' : 'Connect vehicle'}
              </Button>
            )}
            {(ready || failed) && (
              <Button variant="secondary" onClick={connection.disconnect}>
                Disconnect
              </Button>
            )}
          </div>
        </div>

        {started ? (
          <ConnectionSequence phases={phases} />
        ) : (
          <EmptyState
            eyebrow="Not connected"
            title="Connect to read this vehicle"
            description="Each step below runs a real operation against the adapter and reports what it returns."
          />
        )}
      </Card>

      {ready && summary && (
        <Card>
          <ConnectionStatus
            connected
            vehicleName={vehicleName}
            ecuDetected={Boolean(summary.ecuName)}
            modulesResponding={summary.modulesResponding}
            modulesFound={summary.modulesFound}
            parameterCount={summary.supportedParameterCount}
            isSimulated={isSimulated}
          />

          {summary.storedDtcCount > 0 && (
            <p className="border-line text-content-secondary mt-5 border-t pt-4 text-sm">
              {summary.storedDtcCount} stored fault
              {summary.storedDtcCount === 1 ? '' : 's'} found. Reading and interpreting them arrives
              with the diagnostic engine in Stage 9.
            </p>
          )}
        </Card>
      )}

      {/*
        Which profile describes the provider in use. Chosen from the
        descriptor rather than assumed, so a provider added later that has no
        profile shows nothing rather than someone else's capability table.
      */}
      {(() => {
        const profile = getProfile(isSimulated ? 'simulated' : 'elm327-usb-serial');
        if (!profile) return null;

        return (
          <CompatibilityPanel
            profile={profile}
            observed={{
              supportedParameterIds: connection.supportedParameterIds,
              vinReturned: summary ? summary.vin !== null : null,
              streaming: ready ? true : null,
              negotiated: ready,
            }}
          />
        );
      })()}

      {isSimulated && (
        <SimulationControls
          scenarios={connection.scenarios}
          activeScenario={connection.activeScenario}
          onScenarioChange={connection.setScenario}
          onInjectDtc={connection.injectDtc}
          onClearFaults={connection.clearFaults}
          disabled={!ready}
        />
      )}
    </div>
  );
}
