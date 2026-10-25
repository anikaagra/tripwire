const STYLES: Record<string, string> = {
  allow: "bg-allow-bg text-allow",
  block: "bg-block-bg text-block",
  ask: "bg-ask-bg text-ask",
};

const LABELS: Record<string, string> = {
  allow: "Allowed",
  block: "Blocked",
  ask: "Ask",
};

/** The allow/block/ask pill used everywhere a decision shows up. Colors are chosen to read from the back row. */
export function DecisionChip({ decision, size = "md" }: { decision: string; size?: "md" | "lg" }) {
  const style = STYLES[decision] ?? "bg-border text-muted";
  const label = LABELS[decision] ?? decision;
  const sizing = size === "lg" ? "px-4 py-1.5 text-lg" : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center rounded-full ${sizing} font-semibold uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}
