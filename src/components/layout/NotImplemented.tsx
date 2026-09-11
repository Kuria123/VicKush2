interface NotImplementedProps {
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
export function NotImplemented({
  title,
  stage,
  description,
}: NotImplementedProps) {
  return (
    <section className="mx-auto max-w-lg py-16 text-center">
      <p
        className="font-mono text-xs tracking-widest uppercase"
        style={{ color: 'var(--text-muted)' }}
      >
        Not implemented
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{title}</h1>
      <p
        className="mt-3 text-sm leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {description}
      </p>
      <p
        className="mt-6 inline-block rounded-md border px-3 py-1.5 text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        Planned for {stage}
      </p>
    </section>
  );
}
