'use client';

import { useActionState } from 'react';

import { Badge, Button, Card, Input, Select } from '@/components/ui';
import {
  formatMoney,
  QUOTE_SOURCE_LABELS,
  type QuoteComparison,
} from '@/domain/cost';
import type { ActionResult } from '@/types';

import { recordQuoteAction } from './quote-actions';

/**
 * Quotes the owner has been given, and what can honestly be said about them.
 *
 * Everything shown is either a figure someone was actually quoted or a fact
 * about those figures. There is no "typical price", no "you should expect to
 * pay", and no indication of whether any quote is reasonable — this build has
 * no parts catalogue, no labour rates and no market data, so it has no basis
 * for saying so.
 *
 * The limitation stating that sits above the comparison rather than below it.
 * A reader who takes in the spread and stops has still read the important part.
 */

export interface QuotePanelProps {
  vehicleId: string;
  comparison: QuoteComparison;
}

export function QuotePanel({ vehicleId, comparison }: QuotePanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card surface="sunken">
        <p className="label-technical">What this cannot tell you</p>
        <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
          {comparison.limitations.map((limitation) => (
            <li key={limitation} className="text-pretty">
              {limitation}
            </li>
          ))}
        </ul>
      </Card>

      {comparison.observations.length > 0 && (
        <Card>
          <p className="label-technical">What the quotes say</p>
          <ul className="mt-3 flex flex-col gap-2">
            {comparison.observations.map((observation) => (
              <li key={observation.statement} className="text-sm leading-relaxed text-pretty">
                {observation.statement}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {comparison.quotes.length > 0 && (
        <Card>
          <p className="label-technical mb-3">Recorded quotes</p>
          <ul className="flex flex-col gap-3">
            {comparison.quotes.map((quote) => (
              <li key={quote.id} className="border-line border-l-2 pl-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-pretty">{quote.providedBy}</span>
                  <span className="tabular text-sm font-semibold">
                    {formatMoney(quote.total)}
                  </span>
                </div>
                <p className="text-content-secondary mt-0.5 text-sm text-pretty">
                  {quote.description}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge technical>{QUOTE_SOURCE_LABELS[quote.source]}</Badge>
                  <span className="text-content-muted text-xs">
                    {new Date(quote.receivedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  {quote.partsPortion && (
                    <span className="text-content-muted text-xs">
                      parts {formatMoney(quote.partsPortion)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RecordQuoteForm vehicleId={vehicleId} />
    </div>
  );
}

function RecordQuoteForm({ vehicleId }: { vehicleId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    recordQuoteAction,
    null,
  );

  const fieldError = (name: string) =>
    state && !state.ok ? state.fieldErrors?.[name] : undefined;

  return (
    <Card>
      <p className="label-technical">Record a quote</p>
      <p className="text-content-secondary mt-1 mb-4 text-sm text-pretty">
        A figure you were actually given. Recording a second one lets them be compared with each
        other.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="vehicleId" value={vehicleId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Who quoted it"
            name="providedBy"
            maxLength={120}
            placeholder="Kariuki Motors"
            required
            error={fieldError('providedBy')}
          />
          <Select
            label="Source"
            name="source"
            options={[
              { value: 'MECHANIC', label: 'A garage' },
              { value: 'SUPPLIER', label: 'A parts supplier' },
              { value: 'OWNER', label: 'My own record' },
            ]}
          />
        </div>

        <Input
          label="What it covers"
          name="description"
          maxLength={300}
          placeholder="Replace intake hose, parts and labour"
          required
          hint="Two quotes can only be compared if it is clear what each one includes."
          error={fieldError('description')}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Amount"
            name="amount"
            inputMode="decimal"
            placeholder="8500"
            required
            error={fieldError('amount')}
          />
          <Input
            label="Currency"
            name="currency"
            maxLength={3}
            placeholder="KES"
            defaultValue="KES"
            required
            error={fieldError('currency')}
          />
          <Input
            label="When"
            name="receivedAt"
            type="date"
            required
            error={fieldError('receivedAt')}
          />
        </div>

        <Input label="Notes" name="notes" maxLength={1000} hint="Optional." />

        {state && !state.ok && (
          <p role="alert" className="text-status-fault text-sm">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="text-status-ok text-sm">
            Quote recorded.
          </p>
        )}

        <div>
          <Button type="submit" loading={pending}>
            Record quote
          </Button>
        </div>
      </form>
    </Card>
  );
}
