'use client';

import { useState } from 'react';

import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { SCENARIO_DEFINITIONS, type ScenarioId } from '@/domain/simulation';

/**
 * Controls that exist only because this is a simulator.
 *
 * They are rendered solely when the provider declares fault injection, which
 * only a simulator may do. That keeps them impossible to reach against a real
 * vehicle, where fabricating a fault would be indefensible.
 *
 * Each scenario shows what is physically wrong rather than what the readings
 * will look like — the model decides the symptoms, and stating them here
 * would invite someone to trust the label instead of the evidence.
 */
export function SimulationControls({
  scenarios,
  activeScenario,
  onScenarioChange,
  onInjectDtc,
  onClearFaults,
  disabled,
}: {
  scenarios: readonly string[];
  activeScenario: string | null;
  onScenarioChange: (scenario: string) => void;
  onInjectDtc: (code: string) => string | null;
  onClearFaults: () => void;
  disabled: boolean;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [injected, setInjected] = useState<string[]>([]);

  if (scenarios.length === 0) return null;

  const definition = activeScenario ? SCENARIO_DEFINITIONS[activeScenario as ScenarioId] : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    const message = onInjectDtc(trimmed);
    setError(message);
    if (!message) {
      setInjected((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
      setCode('');
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="label-technical">Simulator controls</p>
          <p className="text-content-secondary mt-1 text-sm">
            Available because this is a simulation. A real adapter cannot fabricate a fault.
          </p>
        </div>
        <Badge tone="warn" technical>
          Simulator
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        <Select
          label="Fault scenario"
          value={activeScenario ?? ''}
          onChange={(event) => onScenarioChange(event.target.value)}
          disabled={disabled}
          options={scenarios.map((id) => ({
            value: id,
            label: SCENARIO_DEFINITIONS[id as ScenarioId]?.label ?? id,
          }))}
        />

        {definition && (
          <p className="border-line text-content-secondary rounded-md border px-3 py-2 text-sm">
            {definition.description}
          </p>
        )}

        <form onSubmit={submit} className="flex items-end gap-2">
          <Input
            label="Inject a fault code"
            placeholder="P0171"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={error ?? undefined}
            disabled={disabled}
            className="font-mono uppercase"
          />
          <Button type="submit" variant="secondary" disabled={disabled}>
            Inject
          </Button>
        </form>

        {injected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-technical">Injected</span>
            {injected.map((value) => (
              <Badge key={value} tone="fault" technical>
                {value}
              </Badge>
            ))}
          </div>
        )}

        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onClearFaults();
              setInjected([]);
              setError(null);
            }}
          >
            Clear faults
          </Button>
        </div>
      </div>
    </Card>
  );
}
