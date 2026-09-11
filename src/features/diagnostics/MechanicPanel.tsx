'use client';

import { useId, useRef, useState } from 'react';

import { Badge, Button, Card } from '@/components/ui';
import { buildMechanicContext, type ConversationMessage } from '@/domain/ai';
import type { ConfirmedDifferential } from '@/domain/confirmation';
import type { DiagnosticAnalysis } from '@/domain/diagnostics';

/**
 * The AI mechanic.
 *
 * Deliberately below the structured diagnosis, like the explanation panel:
 * the conversation draws on the scan, it does not replace it.
 *
 * The transcript is the state, and it is sent whole each turn. A server-side
 * conversation store would be the wrong shape here — sessions are not
 * persisted until Stage 15, so a transcript that outlived the page would
 * reference readings that no longer exist.
 */

export interface MechanicPanelProps {
  analysis: DiagnosticAnalysis | null;
  differential: ConfirmedDifferential | null;
  vehicleName?: string | null;
  isSimulated: boolean;
}

interface Failure {
  message: string;
  code: string;
  violations: readonly string[];
}

const OPENERS = [
  'My vehicle is shaking.',
  'It hesitates when I accelerate.',
  'What should I check first?',
] as const;

export function MechanicPanel({
  analysis,
  differential,
  vehicleName = null,
  isSimulated,
}: MechanicPanelProps) {
  const [messages, setMessages] = useState<readonly ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const inputId = useId();
  const logRef = useRef<HTMLDivElement | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || loading) return;

    const next: ConversationMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setDraft('');
    setFailure(null);
    setLoading(true);

    try {
      const response = await fetch('/api/ai/mechanic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          context: buildMechanicContext({
            vehicleName,
            analysis,
            differential,
            isSimulated,
          }),
          messages: next,
        }),
      });

      const body = (await response.json()) as {
        reply?: { content: string; model: string };
        error?: string;
        code?: string;
        violations?: string[];
      };

      if (!response.ok || !body.reply) {
        setFailure({
          message: body.error ?? `The request failed (${response.status}).`,
          code: body.code ?? 'UPSTREAM_ERROR',
          violations: body.violations ?? [],
        });
        return;
      }

      setModel(body.reply.model);
      setMessages([...next, { role: 'assistant', content: body.reply.content }]);
    } catch (cause) {
      setFailure({
        message: cause instanceof Error ? cause.message : 'The request failed.',
        code: 'UPSTREAM_ERROR',
        violations: [],
      });
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
      });
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-technical">Ask the mechanic</p>
          <p className="text-content-secondary mt-1 text-sm text-pretty">
            Describe what the vehicle is doing. It will ask what a mechanic would ask rather than
            naming a part.
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMessages([]);
              setFailure(null);
            }}
          >
            Start over
          </Button>
        )}
      </div>

      {messages.length > 0 && (
        <div
          ref={logRef}
          role="log"
          aria-label="Conversation with the mechanic"
          aria-live="polite"
          className="border-line mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto border-t pt-4"
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === 'user'
                  ? 'bg-surface-sunken self-end rounded-lg px-3 py-2 text-sm sm:max-w-[85%]'
                  : 'text-sm leading-relaxed whitespace-pre-line sm:max-w-[95%]'
              }
            >
              {message.role === 'assistant' && (
                <span className="label-technical mb-1 block">Mechanic</span>
              )}
              <span className="text-pretty">{message.content}</span>
            </div>
          ))}
          {loading && (
            <p className="text-content-muted text-sm" role="status">
              Thinking…
            </p>
          )}
        </div>
      )}

      {failure && (
        <div
          role="alert"
          className="border-line bg-surface-sunken mt-4 rounded-md border px-3 py-3"
        >
          <p className="text-sm font-medium">
            {failure.code === 'NOT_CONFIGURED'
              ? 'No AI provider is configured'
              : failure.code === 'UNGROUNDED_RESPONSE'
                ? 'That reply was withheld'
                : 'The mechanic could not reply'}
          </p>
          <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
            {failure.message}
          </p>
          {failure.violations.length > 0 && (
            <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm">
              {failure.violations.map((violation) => (
                <li key={violation} className="text-pretty">
                  {violation}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {OPENERS.map((opener) => (
            <Button key={opener} size="sm" variant="secondary" onClick={() => void send(opener)}>
              {opener}
            </Button>
          ))}
        </div>
      )}

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="text-content-secondary text-sm">
            Describe the symptom
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="It shakes when I stop at lights…"
            maxLength={4000}
            className="border-line bg-surface-sunken focus:border-accent focus:ring-accent/30 mt-1.5 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <Button type="submit" loading={loading} disabled={draft.trim().length === 0}>
          Send
        </Button>
      </form>

      <p className="text-content-muted mt-3 text-xs text-pretty">
        {model && <Badge technical className="mr-2">{model}</Badge>}
        Replies are checked against this vehicle&apos;s data before being shown, and one that goes
        beyond it is withheld. No service history, mileage or previous repairs are available, so
        the mechanic will ask rather than assume.
      </p>
    </Card>
  );
}
