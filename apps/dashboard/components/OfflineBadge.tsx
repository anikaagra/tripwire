/** Shown when /replay is playing from the exported file instead of Convex. */
export function OfflineBadge() {
  return (
    <span
      title="Loaded from public/recordings (Convex unreachable or ?source=file)"
      className="display-caps inline-flex items-center gap-2 border border-ask px-2.5 py-0.5 text-sm text-ask"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ask" />
      Offline copy
    </span>
  );
}
