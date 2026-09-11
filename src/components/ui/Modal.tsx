'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utilities/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Built on <dialog>, so focus trapping, Escape handling, inertness of the
 * background and top-layer stacking come from the platform rather than from
 * hand-rolled JavaScript.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Fires for Escape as well as programmatic close, keeping React state
    // in step with the platform's own dismissal.
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-description' : undefined}
      // Clicking the backdrop (the dialog element itself) dismisses.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'border-line m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border p-0',
        'bg-surface-raised text-content shadow-xl',
        'backdrop:bg-[var(--surface-overlay)] backdrop:backdrop-blur-sm',
        'open:animate-rise',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="min-w-0">
          <h2 id="modal-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p id="modal-description" className="text-content-secondary mt-1 text-sm">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="text-content-muted hover:bg-surface-sunken hover:text-content -m-1 shrink-0 rounded p-1 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {children && <div className="p-5 text-sm">{children}</div>}

      {footer && <div className="border-line flex justify-end gap-2 border-t p-4">{footer}</div>}
    </dialog>
  );
}
