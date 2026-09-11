'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utilities/cn';

const CONTROL_BASE =
  'w-full rounded-md border bg-surface-inset px-3 text-sm text-content ' +
  'transition-colors placeholder:text-content-muted ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * Wraps a control with its label, hint and error, wiring up the id and
 * aria-describedby so the association is never forgotten at a call site.
 */
function FieldShell({ label, hint, error, required, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-content text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="text-status-fault ml-0.5">
            *
          </span>
        )}
      </label>

      {children({ id, describedBy })}

      {hint && !error && (
        <p id={hintId} className="text-content-muted text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-status-fault text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className, ...props }: InputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={props.required}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL_BASE,
            'h-9',
            error ? 'border-status-fault' : 'border-line',
            className,
          )}
          {...props}
        />
      )}
    </FieldShell>
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
}

export function Select({ label, hint, error, options, className, ...props }: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={props.required}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL_BASE,
            'h-9 appearance-none bg-[length:1rem] bg-[right_0.625rem_center] bg-no-repeat pr-9',
            "bg-[url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23737f92' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
            error ? 'border-status-fault' : 'border-line',
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
