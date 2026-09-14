'use client';

import { useState } from 'react';

import { Button, Card, CardHeader, Input } from '@/components/ui';

/**
 * The referral report, as the owner sees it before handing it over.
 *
 * Two decisions shape this screen.
 *
 * **The owner sees exactly what the mechanic will see.** The report is shown
 * as the same plain text that gets copied — not a prettier summary of it. A
 * screen that renders a friendlier version of what is actually sent is a
 * screen that lets somebody hand over a document they have not read.
 *
 * **The concern is typed, never suggested.** There is no "based on your scan,
 * you may be experiencing..." prefill. The mechanic will read that line as a
 * quotation from the owner, and it has to be one.
 */

export interface ReferralPanelProps {
  vehicleId: string;
  /** The report with no concern stated, rendered on the server. */
  initialText: string;
  /** Whether the scan behind it came from a simulator. */
  isSimulated: boolean;
}

export function ReferralPanel({ vehicleId, initialText, isSimulated }: ReferralPanelProps) {
  const [concern, setConcern] = useState('');
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/vehicles/${vehicleId}/referral?concern=${encodeURIComponent(concern)}`,
      );

      if (!response.ok) {
        // Rule 3: the failure is shown, not swallowed into a stale report that
        // silently no longer matches what was typed.
        setError('The report could not be rebuilt. The text below is the previous version.');
        return;
      }

      const payload = (await response.json()) as { text?: unknown };
      if (typeof payload.text !== 'string') {
        setError('The server returned something unexpected. The text below is unchanged.');
        return;
      }

      setText(payload.text);
    } catch {
      setError('The report could not be rebuilt. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Report copied.');
    } catch {
      // Clipboard access is refused in more situations than people expect —
      // an insecure origin, a permissions policy, a browser that wants a
      // closer user gesture. Saying so beats a button that appears to do
      // nothing (Rule 3).
      setCopied('Copying was blocked. Select the text and copy it manually.');
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="What is the owner's concern?"
          description="In their own words. This build never fills it in — a mechanic reads this line as a quotation."
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              label="Concern"
              maxLength={500}
              placeholder="e.g. vibration at idle when cold"
              value={concern}
              onChange={(event) => setConcern(event.target.value)}
            />
          </div>
          <Button onClick={regenerate} loading={busy}>
            Update report
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-status-fault mt-3 text-sm">
            {error}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="The report"
          description={
            isSimulated
              ? 'This scan came from the simulator, and the report says so on its first line.'
              : 'This is exactly what is copied. Nothing is added or reworded on the way out.'
          }
          actions={
            <Button variant="secondary" onClick={copy}>
              Copy
            </Button>
          }
        />

        {copied && (
          <p role="status" className="text-content-secondary mb-3 text-sm">
            {copied}
          </p>
        )}

        <pre className="bg-surface-sunken border-line text-content overflow-x-auto rounded-md border p-4 text-xs leading-relaxed whitespace-pre-wrap">
          {text}
        </pre>
      </Card>
    </div>
  );
}
