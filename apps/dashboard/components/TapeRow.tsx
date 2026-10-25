import type { ReactNode } from "react";
import { DecisionChip } from "@/components/DecisionChip";
import { actionText } from "@/lib/actions";

/** Classes for the row wrapper (a Link on the live page, a button on /replay). */
export function tapeRowClass(decision: string): string {
  const edge = decision === "block" ? "border-block bg-block-bg/60" : decision === "ask" ? "border-ask" : "border-transparent";
  return `grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-0.5 border-l-4 px-4 py-2.5 text-left hover:bg-panel-raised sm:grid-cols-[3.5rem_5.5rem_1fr_auto] sm:px-5 stage:py-1.5 ${edge}`;
}

/**
 * One line of the flight recorder: step, time, the action in plain words, the
 * reason (for actions, not reads), and the decision chip. Phones put step,
 * time and chip on one line and the action full width below.
 */
export function TapeRowContent({
  step,
  clock,
  event,
  aside,
}: {
  step: number;
  clock: string;
  event: { tool: string; args: Record<string, unknown>; kind: string; decision: string; reason: string };
  /** Extra line under the chip (latency, Nessie note). */
  aside?: ReactNode;
}) {
  const t = actionText(event);
  const blocked = event.decision === "block";
  return (
    <>
      <span className="font-mono text-base tabular-nums text-muted">{String(step).padStart(2, "0")}</span>
      <span className="font-mono text-base tabular-nums text-muted">{clock}</span>
      <span className="order-last col-span-3 min-w-0 sm:order-none sm:col-span-1">
        <span className={`block text-xl ${event.kind === "source" ? "text-muted" : "text-foreground"}`}>
          {t.verb}
          {t.value && <span className={`ml-2 break-words font-bold ${blocked ? "text-block" : ""}`}>{t.value}</span>}
        </span>
        {event.kind !== "source" && <span className="block text-base text-muted sm:truncate">{event.reason}</span>}
      </span>
      <span className="flex flex-col items-end gap-1 justify-self-end">
        <DecisionChip decision={event.decision} />
        {aside}
      </span>
    </>
  );
}
