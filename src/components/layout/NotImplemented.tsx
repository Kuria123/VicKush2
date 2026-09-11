import { EmptyState } from '@/components/ui';

export interface NotImplementedProps {
  title: string;
  /** The roadmap stage that will deliver this screen. */
  stage: string;
  description: string;
}

/**
 * Honest placeholder for routes that exist but are not built yet.
 *
 * Deliberately renders NO vehicle, sensor or diagnostic values. Showing
 * plausible-looking numbers here would fabricate data (Rule 4).
 */
export function NotImplemented({ title, stage, description }: NotImplementedProps) {
  return (
    <EmptyState
      eyebrow="Not implemented"
      title={title}
      description={
        <>
          <span>{description}</span>
          <span className="mt-4 block">
            <span className="border-line text-content-muted inline-block rounded-md border px-3 py-1.5 text-xs">
              Planned for {stage}
            </span>
          </span>
        </>
      }
    />
  );
}
