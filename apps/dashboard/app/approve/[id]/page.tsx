"use client";

import { use, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Beam } from "@/components/Beam";
import { DecisionIcon } from "@/components/DecisionChip";
import { HoldButton } from "@/components/HoldButton";
import { Label } from "@/components/Panel";
import { actionString, stripYouAsked } from "@/lib/actions";
import { formatUsd } from "@/lib/format";

/** Mirrors APPROVAL_TIMEOUT_MS in packages/shared: the proxy blocks the call when it runs out. */
const APPROVAL_TIMEOUT_MS = 45_000;

/**
 * The vault intercom: one full-screen decision for the judge's phone. What you
 * asked for, what the agent wants to do, why Tripwire is asking, the time left
 * before it auto-blocks, then hold to allow or tap to deny.
 */
export default function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const approval = useQuery(api.approvals.get, { approvalId: id });
  const event = useQuery(api.events.eventById, approval ? { eventId: approval.eventId } : "skip");
  const session = useQuery(api.sessions.currentSession, event ? { sessionId: event.sessionId } : "skip");
  const envState = useQuery(api.envState.byScenario, session?.scenario ? { scenario: session.scenario } : "skip");
  const decide = useMutation(api.approvals.decide);
  const [sending, setSending] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(250);

  if (approval === undefined) return <Shell><p className="display-caps text-xl text-muted">Connecting…</p></Shell>;
  if (approval === null) {
    return (
      <Shell>
        <Outcome tone="muted" title="No request here" body="This approval link doesn't match anything. Check the link on the live session page." />
      </Shell>
    );
  }

  async function respond(status: "approved" | "denied") {
    setSending(status);
    setError(null);
    try {
      await decide({ approvalId: id, status });
    } catch {
      setError("Couldn't reach Tripwire. Check the connection and try again.");
      setSending(null);
    }
  }

  const moneyMove = event?.server === "bank" && (event.tool === "pay_bill" || event.tool === "transfer");

  // Decided, whether here or elsewhere (CLI, another phone, the timeout).
  if (approval.status === "approved") {
    return (
      <Shell beam="armed">
        <Outcome tone="allow" title={moneyMove ? "Allowed: payment sent" : "Allowed"} body={sending ? "The agent is carrying on." : "This request was already allowed."} />
      </Shell>
    );
  }
  if (approval.status === "denied") {
    return (
      <Shell beam="armed">
        <Outcome tone="block" title="Denied: nothing was sent" body={sending ? "Tripwire blocked the call and told the agent." : "This request was already denied."} />
      </Shell>
    );
  }
  if (approval.status === "timed_out") {
    return (
      <Shell beam="armed">
        <Outcome tone="block" title="Timed out: nothing was sent" body="Nobody answered in time, so Tripwire blocked the call." />
      </Shell>
    );
  }

  const leftMs = Math.max(0, approval.createdAt + APPROVAL_TIMEOUT_MS - now);
  if (leftMs === 0) {
    return (
      <Shell beam="armed">
        <Outcome tone="block" title="Time's up: nothing was sent" body="This request waited more than 45 seconds, so Tripwire blocks it automatically." />
      </Shell>
    );
  }

  const what = event ? plainAction(event, envState?.bills) : null;
  const secs = Math.ceil(leftMs / 1000);
  const urgent = secs <= 10;

  return (
    <Shell beam="ask">
      <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-6 stage:min-h-[calc(100dvh-4rem)] stage:gap-3">
        {/* Header: who's calling, and the clock */}
        <div className="flex items-start justify-between gap-4">
          <span className="display-caps inline-flex items-center gap-2 whitespace-nowrap border border-ask bg-ask-bg px-3 py-1.5 text-lg text-ask">
            <DecisionIcon decision="ask" size={16} />
            Needs your OK
          </span>
          <span className={`text-right ${urgent ? "text-block" : "text-ask"}`} role="timer" aria-live="off" aria-label={`${secs} seconds until it auto-blocks`}>
            <span className="font-display block text-4xl font-bold leading-none tabular-nums">0:{String(secs).padStart(2, "0")}</span>
            <span className="whitespace-nowrap font-mono text-sm text-muted">to auto-block</span>
          </span>
        </div>
        <div aria-hidden className="-mt-3 h-1 bg-border">
          <div className={`h-full ${urgent ? "bg-block" : "bg-ask"}`} style={{ width: `${(leftMs / APPROVAL_TIMEOUT_MS) * 100}%` }} />
        </div>

        <div className="flex flex-col gap-5 stage:gap-3">
          <div>
            <Label>You asked</Label>
            <p className="mt-1 text-lg text-foreground">
              {session?.intent ? <>&ldquo;{stripYouAsked(session.intent)}&rdquo;</> : event?.explanation ? <>&ldquo;{stripYouAsked(event.explanation.youAsked)}&rdquo;</> : <span className="text-muted">…</span>}
            </p>
          </div>
          <div>
            <Label>The agent wants to</Label>
            <p className="display-caps mt-1 text-4xl leading-[1.05] text-foreground sm:text-5xl stage:sm:text-4xl">{what ?? "…"}</p>
          </div>
          <div>
            <Label>Why Tripwire is asking</Label>
            <p className="mt-1 text-lg text-ask">{event?.reason ?? "…"}</p>
          </div>
        </div>

        {/* Thumb zone */}
        <div className="mt-auto flex flex-col gap-3 pb-2">
          {error && <p className="text-base text-block">{error}</p>}
          <HoldButton
            key={error ?? "ready"} // a failed send remounts it so the judge can hold again
            label="Hold to allow"
            onConfirm={() => respond("approved")}
            disabled={sending !== null || !event}
            className="display-caps h-20 w-full stage:h-16 border-2 border-allow bg-allow-bg text-3xl text-allow"
          >
            <DecisionIcon decision="allow" size={24} />
            {sending === "approved" ? "Allowing…" : "Hold to allow"}
          </HoldButton>
          <button
            type="button"
            onClick={() => respond("denied")}
            disabled={sending !== null}
            className="display-caps flex h-16 w-full stage:h-14 items-center justify-center gap-3 border-2 border-block bg-block-bg text-2xl text-block active:bg-block active:text-background disabled:opacity-50"
          >
            <DecisionIcon decision="block" size={20} />
            {sending === "denied" ? "Denying…" : "Deny"}
          </button>
          <p className="text-center font-mono text-sm text-muted">Hold for one second to allow. One tap denies.</p>
        </div>
      </div>
    </Shell>
  );
}

/** "Pay Bay Electric $486.00" when the bank lists the bill; otherwise the generic action text. */
function plainAction(
  event: { tool: string; args: Record<string, unknown> },
  bills: { id: string; payee: string; amountCents: number }[] | undefined,
): string {
  if (event.tool === "pay_bill") {
    const bill = bills?.find((b) => b.id === event.args.bill_id);
    if (bill) return `Pay ${bill.payee} ${formatUsd(bill.amountCents)}`;
  }
  return actionString(event);
}

/** Full-screen frame: no nav, the beam across the top, one centered column. */
function Shell({ beam = "ask", children }: { beam?: "ask" | "armed"; children: ReactNode }) {
  return (
    <div className="-mx-6 -mt-8 stage:-mt-3">
      <Beam state={beam} />
      <div className="mx-auto w-full max-w-lg px-5 pt-5">{children}</div>
    </div>
  );
}

function Outcome({ tone, title, body }: { tone: "allow" | "block" | "muted"; title: string; body: string }) {
  const color = tone === "allow" ? "text-allow border-allow/60 bg-allow-bg" : tone === "block" ? "text-block border-block bg-block-bg" : "text-muted border-border bg-panel";
  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col justify-center">
      <div className={`border-2 px-6 py-10 text-center ${color}`}>
        {tone !== "muted" && (
          <span className="mx-auto mb-4 block w-fit">
            <DecisionIcon decision={tone} size={44} />
          </span>
        )}
        <h1 className="display-caps text-5xl leading-[1.05]">{title}</h1>
        <p className="mt-4 text-lg text-foreground">{body}</p>
      </div>
    </div>
  );
}

/** Current time, refreshed every `ms`, for the countdown. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
