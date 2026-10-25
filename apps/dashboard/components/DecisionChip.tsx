const STYLES: Record<string, string> = {
  allow: "border-allow/60 bg-allow-bg text-allow",
  block: "border-block bg-block-bg text-block",
  ask: "border-ask bg-ask-bg text-ask",
};

const LABELS: Record<string, string> = {
  allow: "Allowed",
  block: "Blocked",
  ask: "Needs OK",
};

/**
 * Each decision has its own shape as well as its own word and color, so it
 * reads on a washed-out projector and for colorblind viewers:
 * allowed = circle, needs OK = triangle, blocked = square with a cross.
 */
export function DecisionIcon({ decision, size = 14 }: { decision: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 14 14", "aria-hidden": true } as const;
  if (decision === "block") {
    return (
      <svg {...common}>
        <rect x="1" y="1" width="12" height="12" fill="currentColor" />
        <path d="M4 4 L10 10 M10 4 L4 10" stroke="var(--background)" strokeWidth="2" />
      </svg>
    );
  }
  if (decision === "ask") {
    return (
      <svg {...common}>
        <path d="M7 1 L13.5 13 H0.5 Z" fill="currentColor" />
        <path d="M7 5 V9 M7 10.5 V11.8" stroke="var(--background)" strokeWidth="1.8" />
      </svg>
    );
  }
  if (decision === "allow") {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2 7 H12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** The allow / block / ask plate used everywhere a decision shows up. */
export function DecisionChip({ decision, size = "md" }: { decision: string; size?: "md" | "lg" }) {
  const style = STYLES[decision] ?? "border-border bg-panel text-muted";
  const label = LABELS[decision] ?? decision;
  const sizing = size === "lg" ? "gap-2.5 px-4 py-2 text-2xl" : "gap-2 px-2.5 py-1 text-base";
  return (
    <span className={`display-caps inline-flex shrink-0 items-center whitespace-nowrap border leading-none ${sizing} ${style}`}>
      <DecisionIcon decision={decision} size={size === "lg" ? 20 : 14} />
      {label}
    </span>
  );
}
