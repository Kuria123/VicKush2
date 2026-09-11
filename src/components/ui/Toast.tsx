'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { cn } from '@/lib/utilities/cn';

export type ToastTone = 'info' | 'ok' | 'warn' | 'fault';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

const ICON = {
  info: Info,
  ok: CheckCircle2,
  warn: AlertTriangle,
  fault: XCircle,
} as const;

const TONE: Record<ToastTone, string> = {
  info: 'text-accent',
  ok: 'text-status-ok',
  warn: 'text-status-warn',
  fault: 'text-status-fault',
};

interface ToastContextValue {
  toasts: readonly Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>.');
  }
  return context;
}

const DEFAULT_DURATION_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...toast, id }]);
      // Faults persist: a diagnostic failure must not scroll away unread.
      if (toast.tone !== 'fault') {
        setTimeout(() => dismiss(id), DEFAULT_DURATION_MS);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      // Polite: toasts report completed work and must not interrupt a screen
      // reader mid-sentence.
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((toast) => {
        const Icon = ICON[toast.tone];
        return (
          <div
            key={toast.id}
            className={cn(
              'animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3',
              'border-line bg-surface-raised rounded-lg border p-3 shadow-lg',
            )}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', TONE[toast.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description && (
                <p className="text-content-secondary mt-0.5 text-xs">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label={`Dismiss: ${toast.title}`}
              className="text-content-muted hover:bg-surface-sunken hover:text-content -m-1 shrink-0 rounded p-1 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
