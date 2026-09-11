'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Input } from '@/components/ui';
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
    <Button type="submit" loading={pending} fullWidth>
      {pending ? 'Working…' : label}
    </Button>
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
          className="border-status-fault bg-status-fault-subtle text-status-fault rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      )}

      {fields.map((field) => (
        <Input
          key={field.name}
          name={field.name}
          label={field.label}
          type={field.type}
          autoComplete={field.autoComplete}
          hint={field.hint}
          error={errors[field.name]}
          required
        />
      ))}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
