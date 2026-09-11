import { IDENTIFICATION_STATUS_LABELS, type IdentificationAssessment } from '@/domain/vehicles';
import { Badge, Card, Meter } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

/**
 * Confidence drives both the badge and the meter, because the badge's text is
 * the confidence figure. Tying the badge to status instead would paint a
 * middling number green whenever the status happened to be "Identified" —
 * overstating how sure we are.
 */
function confidenceTone(confidence: number): BadgeTone {
  if (confidence >= 75) return 'ok';
  if (confidence >= 40) return 'warn';
  return 'fault';
}

function meterTone(confidence: number) {
  if (confidence >= 75) return 'ok' as const;
  if (confidence >= 40) return 'warn' as const;
  return 'fault' as const;
}

/**
 * Shows how sure we are that we know what this vehicle is — and why.
 *
 * The score is never presented on its own: the evidence behind it and the
 * gaps remaining are both listed, so the number can always be traced back to
 * the facts that produced it.
 */
export function IdentificationPanel({ assessment }: { assessment: IdentificationAssessment }) {
  const { status, confidence, contributions, gaps } = assessment;

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="label-technical">Identification</p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight">
            {IDENTIFICATION_STATUS_LABELS[status]}
          </p>
        </div>
        <Badge tone={confidenceTone(confidence)}>{confidence}% confident</Badge>
      </div>

      <Meter
        label="Identification confidence"
        hideLabel
        value={confidence}
        tone={meterTone(confidence)}
      />

      {contributions.length > 0 && (
        <div className="mt-5">
          <h3 className="label-technical">Evidence</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {contributions.map((item) => (
              <li
                key={item.field}
                className="text-content-secondary flex items-start justify-between gap-4 text-sm"
              >
                <span>{item.reason}</span>
                <span className="tabular text-content-muted shrink-0 text-xs">+{item.points}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="border-line mt-5 border-t pt-4">
          <h3 className="label-technical">Not yet known</h3>
          <ul className="text-content-secondary mt-2 flex flex-col gap-1.5 text-sm">
            {gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
