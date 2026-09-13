'use client';

import { Badge, Card } from '@/components/ui';
import {
  CAPABILITY_LABELS,
  CONNECTION_LABELS,
  HARDWARE_CAPABILITIES,
  capabilityOf,
  resolveProfile,
  summarise,
  type AdapterProfile,
  type CapabilityEntry,
  type ObservedCapabilities,
} from '@/domain/hardware';

/**
 * What this adapter can and cannot do.
 *
 * The brief asks for a tick-or-cross capability list and separately forbids
 * implying a capability exists when it does not. A binary cannot satisfy both:
 * before a vehicle has been asked, a cross is a definite negative nobody
 * established, and a tick is a guess about the reader's car.
 *
 * So there are three marks, and the third is not decoration. "Not established"
 * is the honest state of most capabilities before connecting, and it reads
 * differently from both of the others on purpose.
 *
 * Every row carries its reason, because a bare cross invites the reader to
 * assume their adapter is faulty when the limitation is usually in this build
 * or in the vehicle.
 */

export interface CompatibilityPanelProps {
  profile: AdapterProfile;
  observed: ObservedCapabilities;
}

const STATE_MARK = {
  SUPPORTED: '✓',
  NOT_SUPPORTED: '✗',
  UNKNOWN: '?',
} as const;

const STATE_TONE = {
  SUPPORTED: 'ok',
  NOT_SUPPORTED: 'neutral',
  UNKNOWN: 'warn',
} as const;

const STATE_LABEL = {
  SUPPORTED: 'Available',
  NOT_SUPPORTED: 'Not available',
  UNKNOWN: 'Not established',
} as const;

export function CompatibilityPanel({ profile, observed }: CompatibilityPanelProps) {
  const resolved = resolveProfile(profile, observed);
  const summary = summarise(resolved);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-technical">Adapter capabilities</p>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-balance">
            {resolved.name}
          </h3>
          <p className="text-content-secondary mt-1 text-sm">
            {CONNECTION_LABELS[resolved.connection]} ·{' '}
            {observed.negotiated
              ? 'resolved against this vehicle'
              : 'before connecting — the vehicle has not been asked yet'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge tone="ok">{summary.supported} available</Badge>
          {summary.unknown > 0 && <Badge tone="warn">{summary.unknown} not established</Badge>}
          <Badge tone="neutral">{summary.notSupported} not available</Badge>
        </div>
      </div>

      {!resolved.verifiedAgainstHardware && (
        <p
          role="note"
          className="border-status-warn bg-status-warn-subtle text-status-warn mt-4 rounded-md border px-3 py-2 text-sm text-pretty"
        >
          <strong className="font-semibold">Never tested against a physical adapter.</strong> The
          protocol and decoding are fully tested; the connection layer is not.
        </p>
      )}

      <ul className="border-line mt-4 flex flex-col gap-3 border-t pt-4">
        {HARDWARE_CAPABILITIES.map((capability) => (
          <CapabilityRow key={capability} entry={capabilityOf(resolved, capability)} />
        ))}
      </ul>

      {resolved.protocols.length > 0 && (
        <div className="border-line mt-4 border-t pt-3">
          <p className="label-technical">Protocols</p>
          <ul className="text-content-secondary mt-2 flex flex-col gap-1 text-sm">
            {resolved.protocols.map((protocol) => (
              <li key={protocol} className="text-pretty">
                {protocol}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolved.notes.length > 0 && (
        <div className="border-line mt-4 border-t pt-3">
          <p className="label-technical">Worth knowing</p>
          <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
            {resolved.notes.map((note) => (
              <li key={note} className="text-pretty">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function CapabilityRow({ entry }: { entry: CapabilityEntry }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={
          entry.state === 'SUPPORTED'
            ? 'text-status-ok shrink-0 font-semibold'
            : entry.state === 'UNKNOWN'
              ? 'text-status-warn shrink-0 font-semibold'
              : 'text-content-muted shrink-0 font-semibold'
        }
      >
        {STATE_MARK[entry.state]}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium">{CAPABILITY_LABELS[entry.capability]}</span>
          {/* The state in words as well as a mark: a glyph alone is not an
              accessible way to carry the only meaning in the row. */}
          <Badge tone={STATE_TONE[entry.state]}>{STATE_LABEL[entry.state]}</Badge>
        </div>
        <p className="text-content-secondary mt-0.5 text-sm leading-relaxed text-pretty">
          {entry.reason}
        </p>
      </div>
    </li>
  );
}
