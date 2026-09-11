'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Meter,
  Modal,
  Readout,
  Select,
  Skeleton,
  Sparkline,
  StatusIndicator,
  Table,
  Tabs,
  ToastProvider,
  useToast,
} from '@/components/ui';
import type { ReadingState } from '@/components/ui';

/* Illustrative sequences for the visual reference only. They are shaped like
 * telemetry so the components can be judged, but they describe no vehicle and
 * are never presented as a reading. */
const DEMO_TREND = [12.4, 12.5, 12.4, 12.3, 12.35, 12.2, 12.15, 12.1];
const DEMO_RISING = [2, 4, 3, 6, 8, 7, 11, 14];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-line border-t pt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="text-content-secondary mt-1 max-w-2xl text-sm">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function ToastDemo() {
  const { push } = useToast();
  return (
    <Row>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => push({ tone: 'info', title: 'Scan queued' })}
      >
        Info
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => push({ tone: 'ok', title: 'Connected', description: 'Adapter ready.' })}
      >
        Success
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => push({ tone: 'warn', title: 'Signal unstable' })}
      >
        Warning
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          push({
            tone: 'fault',
            title: 'Connection lost',
            description: 'Faults persist until dismissed.',
          })
        }
      >
        Fault
      </Button>
    </Row>
  );
}

const UNAVAILABLE_STATES: readonly Exclude<ReadingState, 'AVAILABLE'>[] = [
  'UNAVAILABLE',
  'UNSUPPORTED',
  'NOT_READING',
  'ERROR',
];

export function DesignSystemShowcase() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="mx-auto flex max-w-4xl flex-col gap-8 pb-16">
        <header>
          <p className="label-technical">Reference</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Design system</h1>
          <p className="text-content-secondary mt-2 max-w-2xl text-sm">
            Every component in the system, in the current theme. Use the theme switch in the top bar
            to check both.
          </p>
          <p className="border-status-warn bg-status-warn-subtle text-status-warn mt-4 rounded-md border px-3 py-2 text-sm">
            Values on this page are illustrative placeholders for judging the components. They
            describe no vehicle and are not diagnostic readings.
          </p>
        </header>

        <Section
          title="Typography"
          description="Base is 14px. Technical interfaces are dense; emphasis comes from weight and tracking rather than size."
        >
          <div className="flex flex-col gap-3">
            <p className="text-4xl font-semibold tracking-tight">Display 40 — hero figure</p>
            <p className="text-2xl font-semibold tracking-tight">Heading 24 — page title</p>
            <p className="text-lg font-semibold tracking-tight">Heading 16 — card title</p>
            <p>Body 14 — the default reading size for prose and controls.</p>
            <p className="text-content-secondary text-sm">
              Small 13 — secondary copy and supporting description.
            </p>
            <p className="text-content-muted text-xs">Caption 12 — hints and metadata.</p>
            <p className="label-technical">Label — instrument caption</p>
            <p className="tabular font-mono">1234.56 — monospace tabular readout</p>
          </div>
        </Section>

        <Section
          title="Colour"
          description="Semantic tokens only. Every text pairing is verified against WCAG AA in both themes."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Surface base', 'bg-surface-base'],
              ['Surface raised', 'bg-surface-raised'],
              ['Surface sunken', 'bg-surface-sunken'],
              ['Accent', 'bg-accent'],
              ['Telemetry', 'bg-telemetry-mark'],
              ['Status ok', 'bg-status-ok-mark'],
              ['Status warn', 'bg-status-warn-mark'],
              ['Status fault', 'bg-status-fault-mark'],
            ].map(([name, klass]) => (
              <div key={name} className="border-line overflow-hidden rounded-md border">
                <div className={`h-12 ${klass}`} />
                <p className="text-content-secondary px-2 py-1.5 text-xs">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-col gap-4">
            <Row>
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </Row>
            <Row>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
            <Row>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </Row>
          </div>
        </Section>

        <Section
          title="Status and badges"
          description="Status never relies on colour alone — it always carries a label or an icon."
        >
          <div className="flex flex-col gap-4">
            <Row>
              <StatusIndicator tone="ok" label="Nominal" />
              <StatusIndicator tone="warn" label="Degraded" />
              <StatusIndicator tone="fault" label="Fault" pulse />
              <StatusIndicator tone="idle" label="Idle" />
              <StatusIndicator tone="live" label="Streaming" pulse />
            </Row>
            <Row>
              <Badge>Neutral</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="telemetry">Telemetry</Badge>
              <Badge tone="ok">Pass</Badge>
              <Badge tone="warn">Marginal</Badge>
              <Badge tone="fault">Fail</Badge>
              <Badge technical>Technical</Badge>
            </Row>
          </div>
        </Section>

        <Section title="Form controls">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Registration" placeholder="KDA 123A" />
            <Input label="Odometer" type="number" hint="Whole kilometres." placeholder="84000" />
            <Input label="VIN" defaultValue="not-a-real-vin" error="Must be 17 characters." />
            <Select
              label="Fuel"
              options={[
                { value: 'petrol', label: 'Petrol' },
                { value: 'diesel', label: 'Diesel' },
                { value: 'hybrid', label: 'Hybrid' },
              ]}
            />
          </div>
        </Section>

        <Section
          title="Readouts"
          description="A readout cannot display a value unless it has one. The unavailable states are separate types, so a missing reading can never be rendered as a number."
        >
          <div className="flex flex-col gap-5">
            <div className="border-line bg-surface-raised grid gap-5 rounded-lg border p-5 sm:grid-cols-3">
              <Readout label="Battery" value="12.1" unit="V" live trend={DEMO_TREND} />
              <Readout
                label="Health score"
                value={91}
                unit="/100"
                delta={-3}
                deltaPeriod="last scan"
                upIsGood
              />
              <Readout
                label="Fuel trim"
                value="+14.2"
                unit="%"
                delta={6}
                deltaPeriod="last scan"
                upIsGood={false}
                trend={DEMO_RISING}
              />
            </div>

            <div className="border-line bg-surface-raised grid gap-5 rounded-lg border p-5 sm:grid-cols-4">
              {UNAVAILABLE_STATES.map((state) => (
                <Readout key={state} label={state.replace('-', ' ')} state={state} />
              ))}
            </div>
          </div>
        </Section>

        <Section
          title="Meters and trends"
          description="The unfilled track is a lighter step of the same ramp, so state reads across the whole bar."
        >
          <Card className="flex flex-col gap-4">
            <Meter label="Engine" value={88} valueText="88/100" tone="ok" />
            <Meter label="Electrical" value={64} valueText="64/100" tone="warn" />
            <Meter label="Cooling" value={31} valueText="31/100" tone="fault" />
            <Meter label="Overall" value={72} valueText="72/100" tone="accent" />
            <div className="flex items-center gap-6 pt-2">
              <Sparkline values={DEMO_TREND} label="Battery voltage" unit="V" />
              <Sparkline values={DEMO_RISING} label="Fuel trim" unit="%" tone="warn" />
              <Sparkline values={DEMO_TREND} label="Flat" tone="muted" fill={false} />
            </div>
          </Card>
        </Section>

        <Section title="Table">
          <Table
            caption="Example rows"
            rowKey={(row) => row.id}
            columns={[
              { key: 'id', header: 'Code', render: (r) => <Badge technical>{r.id}</Badge> },
              { key: 'desc', header: 'Description', render: (r) => r.desc },
              {
                key: 'count',
                header: 'Count',
                numeric: true,
                render: (r) => r.count,
              },
            ]}
            rows={[
              { id: 'EXAMPLE-1', desc: 'Illustrative row', count: 3 },
              { id: 'EXAMPLE-2', desc: 'Illustrative row', count: 12 },
              { id: 'EXAMPLE-3', desc: 'Illustrative row', count: 1 },
            ]}
          />
        </Section>

        <Section title="Tabs">
          <Tabs
            items={[
              {
                value: 'overview',
                label: 'Overview',
                content: (
                  <p className="text-content-secondary text-sm">
                    Arrow keys move between tabs; Home and End jump to the ends.
                  </p>
                ),
              },
              {
                value: 'evidence',
                label: 'Evidence',
                content: <p className="text-content-secondary text-sm">Second panel.</p>,
              },
              { value: 'disabled', label: 'Disabled', content: null, disabled: true },
            ]}
          />
        </Section>

        <Section
          title="Overlays"
          description="The dialog is a native <dialog>, so focus trapping and Escape come from the platform."
        >
          <div className="flex flex-col gap-4">
            <Row>
              <Button variant="secondary" onClick={() => setModalOpen(true)}>
                Open dialog
              </Button>
            </Row>
            <ToastDemo />
          </div>

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Confirm action"
            description="An example dialog."
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>Confirm</Button>
              </>
            }
          >
            <p className="text-content-secondary">Dialog body content sits here.</p>
          </Modal>
        </Section>

        <Section title="Feedback states">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Loading" />
              <LoadingState label="Reading modules…" />
            </Card>
            <Card>
              <CardHeader title="Skeleton" />
              <div className="flex flex-col gap-2 py-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
            <Card>
              <EmptyState
                eyebrow="Nothing yet"
                title="No vehicles"
                description="Add a vehicle to begin."
                action={<Button size="sm">Add vehicle</Button>}
              />
            </Card>
            <Card>
              <ErrorState
                title="Could not read data"
                description="The adapter stopped responding."
                action={
                  <Button size="sm" variant="secondary">
                    Retry
                  </Button>
                }
              />
            </Card>
          </div>
        </Section>
      </div>
    </ToastProvider>
  );
}
