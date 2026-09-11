'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { ActionResult } from '@/types';

type AuthAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

interface Field {
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
}

interface AuthFormProps {
  action: AuthAction;
  fields: readonly Field[];
  submitLabel: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
      style={{
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-contrast)',
      }}
    >
      {pending ? 'Working…' : label}
    </button>
  );
}

export function AuthForm({ action, fields, submitLabel }: AuthFormProps) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const formError = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {formError && (
        <p
          role="alert"
          className="rounded-md border px-3 py-2 text-sm"
          style={{ color: 'var(--color-status-fault)' }}
        >
          {formError}
        </p>
      )}

      {fields.map((field) => {
        const errorId = `${field.name}-error`;
        const hintId = `${field.name}-hint`;
        const fieldError = errors[field.name];

        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={field.name} className="text-sm font-medium">
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              required
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={
                [fieldError ? errorId : null, field.hint ? hintId : null]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              className="rounded-md border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: 'var(--surface-base)' }}
            />
            {field.hint && (
              <p id={hintId} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {field.hint}
              </p>
            )}
            {fieldError && (
              <p id={errorId} className="text-xs" style={{ color: 'var(--color-status-fault)' }}>
                {fieldError}
              </p>
            )}
          </div>
        );
      })}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
