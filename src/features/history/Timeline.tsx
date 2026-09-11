import { Badge, Card } from '@/components/ui';
import type { TimelineEntry } from '@/services/diagnostics/history';

/**
 * The vehicle timeline.
 *
 * Grouped by month, newest first, on a single continuous rail. The grouping is
 * what makes it read as a history rather than a log: "MAR — P0171 detected,
 * vacuum leak confirmed" is a story, and the same rows as a flat list of
 * timestamps are not.
 *
 * Every row here is something that actually happened and was recorded. There
 * are no projected, expected or inferred entries, and no row exists that was
 * not written in the same transaction as the record it describes.
 */

export interface TimelineProps {
  entries: readonly TimelineEntry[];
}

const KIND_LABEL: Record<TimelineEntry['kind'], string> = {
  SCAN_RECORDED: 'Scan',
  DTC_OBSERVED: 'Fault code',
  FINDING_RAISED: 'Finding',
  DIAGNOSIS_REACHED: 'Diagnosis',
  TEST_PERFORMED: 'Test',
  MAINTENANCE_LOGGED: 'Maintenance',
};

/** Marks are graphic, so they use the vivid `-mark` steps, not the text steps. */
const MARK: Record<TimelineEntry['kind'], string> = {
  SCAN_RECORDED: 'bg-telemetry-mark',
  DTC_OBSERVED: 'bg-status-warn-mark',
  FINDING_RAISED: 'bg-status-warn-mark',
  DIAGNOSIS_REACHED: 'bg-accent',
  TEST_PERFORMED: 'bg-accent',
  MAINTENANCE_LOGGED: 'bg-status-ok-mark',
};

const SEVERITY_TONE = {
  SEVERE: 'fault',
  SIGNIFICANT: 'warn',
  ADVISORY: 'accent',
  INFO: 'neutral',
} as const;

export function Timeline({ entries }: TimelineProps) {
  if (entries.length === 0) {
    return (
      <Card>
        <p className="text-content-secondary text-sm leading-relaxed">
          Nothing has been recorded for this vehicle yet. Save a diagnosis, or log a service you
          have already had done, and it will appear here.
        </p>
      </Card>
    );
  }

  const months = groupByMonth(entries);

  return (
    <div className="flex flex-col gap-8">
      {months.map((month) => (
        <section key={month.key}>
          <div className="mb-4 flex items-baseline gap-3">
            <h3 className="label-technical text-content">{month.label}</h3>
            <span className="text-content-muted text-xs">
              {month.entries.length} {month.entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {/* The rail. Hairline, recessive: it orders the marks, it is not a
              mark itself. */}
          <ol className="border-line relative ml-2 flex flex-col gap-4 border-l pl-6">
            {month.entries.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`border-surface-raised absolute top-4 -left-[1.9375rem] h-2.5 w-2.5 rounded-full border-2 ${MARK[entry.kind]}`}
                />

                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Badge technical>{KIND_LABEL[entry.kind]}</Badge>
                        {entry.severity && (
                          <Badge tone={SEVERITY_TONE[entry.severity]}>
                            {entry.severity.charAt(0) + entry.severity.slice(1).toLowerCase()}
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-base font-semibold tracking-tight text-balance">
                        {entry.title}
                      </h4>
                    </div>

                    <time
                      dateTime={entry.occurredAt.toISOString()}
                      className="tabular text-content-muted shrink-0 text-xs"
                    >
                      {formatDay(entry.occurredAt)}
                    </time>
                  </div>

                  {entry.detail && (
                    <p className="text-content-secondary mt-2 text-sm leading-relaxed text-pretty">
                      {entry.detail}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

interface MonthGroup {
  key: string;
  label: string;
  entries: TimelineEntry[];
}

function groupByMonth(entries: readonly TimelineEntry[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const entry of entries) {
    const date = entry.occurredAt;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: date
          .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
          .toUpperCase(),
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }

  // Entries arrive newest first, so the groups are already in order.
  return [...groups.values()];
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
