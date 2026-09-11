export default function Loading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center text-sm"
      style={{ color: 'var(--text-secondary)' }}
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}
