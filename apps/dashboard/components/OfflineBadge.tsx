/** Shown when /replay is playing from the exported file instead of Convex. */
export function OfflineBadge() {
  return (
    <span
      title="Loaded from public/recordings (Convex unreachable or ?source=file)"
      className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted"
    >
      Offline copy
    </span>
  );
}
