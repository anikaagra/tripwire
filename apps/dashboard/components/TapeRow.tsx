import type { ReactNode } from "react";
import { Activity, ArrowRightLeft, Eye, Inbox, Landmark, Mail, ReceiptText, Send, Wallet, Zap, type LucideIcon } from "lucide-react";
import { DecisionChip } from "@/components/DecisionChip";
import { TraceLine } from "@/components/FirewallTrace";
import { actionText } from "@/lib/actions";
import type { InboxEmail } from "@/lib/context";

const TOOL_ICON: Record<string, LucideIcon> = {
  list_emails: Inbox,
  read_email: Mail,
  send_email: Send,
  get_balance: Wallet,
  list_bills: ReceiptText,
  pay_bill: Landmark,
  transfer: ArrowRightLeft,
};

/** Classes for the row wrapper (a Link on the live page, a button on /replay). */
export function tapeRowClass(decision: string): string {
  const edge = decision === "block" ? "border-block bg-block-bg/60" : decision === "ask" ? "border-ask" : "border-transparent";
  return `grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-0.5 border-l-4 px-4 py-2.5 text-left hover:bg-panel-raised sm:grid-cols-[3.5rem_5.5rem_1fr_auto] sm:px-5 stage:py-1.5 ${edge}`;
}

/**
 * One line of the flight recorder: step, time, whether it reads or acts, the
 * action in plain words (an email's subject and sender instead of its id), the
 * reason and the guard's trace (for actions, not reads), and the decision chip.
 * Phones put step, time and chip on one line and the action full width below.
 */
export function TapeRowContent({
  step,
  clock,
  event,
  email,
  aside,
}: {
  step: number;
  clock: string;
  event: {
    tool: string;
    args: Record<string, unknown>;
    kind: string;
    decision: string;
    reason: string;
    // Present on live events; recordings may not carry them, and the trace line is skipped.
    ruleHits?: { rule: string; detail: string }[];
    taintHits?: { argKey: string; value: string; spanId: string }[];
    explanation?: { headline: string };
  };
  /** The email this read_email call opened, from the scenario's inbox seed. */
  email?: InboxEmail;
  /** Extra line under the chip (latency, Nessie note). */
  aside?: ReactNode;
}) {
  const t = actionText(event);
  const blocked = event.decision === "block";
  const ToolIcon = TOOL_ICON[event.tool] ?? Activity;
  const sink = event.kind === "sink";
  return (
    <>
      <span className="font-mono text-base tabular-nums text-muted">{String(step).padStart(2, "0")}</span>
      <span className="flex flex-col font-mono text-base tabular-nums text-muted">
        {clock}
        {/* Reads pass straight through; actions are held until Tripwire decides. */}
        <span className={`display-caps text-xs ${sink ? "text-foreground" : "text-muted"}`}>
          {sink ? (
            <>
              <Zap aria-hidden className="mr-0.5 inline-block h-3 w-3 -translate-y-px" />
              Acts · held
            </>
          ) : (
            <>
              <Eye aria-hidden className="mr-0.5 inline-block h-3 w-3 -translate-y-px" />
              Reads
            </>
          )}
        </span>
      </span>
      <span className="order-last col-span-3 min-w-0 sm:order-none sm:col-span-1">
        <span className={`block text-xl ${event.kind === "source" ? "text-muted" : "text-foreground"}`}>
          <ToolIcon aria-hidden className="mr-2 inline-block h-5 w-5 -translate-y-0.5" strokeWidth={1.5} />
          {t.verb}
          {email?.subject ? (
            <span className="ml-2 break-words text-foreground">&ldquo;{email.subject}&rdquo;</span>
          ) : (
            t.value && <span className={`ml-2 break-words font-bold ${blocked ? "text-block" : ""}`}>{t.value}</span>
          )}
        </span>
        {email?.from && <span className="block text-base text-muted">from {email.from}</span>}
        {event.kind !== "source" && <span className="block text-base text-muted sm:truncate">{event.reason}</span>}
        {sink && event.ruleHits && event.taintHits && (
          <TraceLine event={{ ...event, ruleHits: event.ruleHits, taintHits: event.taintHits }} />
        )}
      </span>
      <span className="flex flex-col items-end gap-1 justify-self-end">
        <DecisionChip decision={event.decision} />
        {aside}
      </span>
    </>
  );
}
