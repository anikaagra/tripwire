export function formatUsd(cents: number | undefined): string {
  if (cents === undefined) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRelative(ts: number, now = Date.now()): string {
  const deltaSec = Math.round((now - ts) / 1000);
  if (deltaSec < 2) return "just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;
  return `${Math.round(deltaSec / 60)}m ago`;
}
