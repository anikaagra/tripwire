"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { Beam, type BeamMark, type BeamState } from "@/components/Beam";
import { BigNumber } from "@/components/BigNumber";
import { DecisionChip, DecisionIcon } from "@/components/DecisionChip";
import { Label, Panel } from "@/components/Panel";
import { actionString, actionText } from "@/lib/actions";
import { formatClock } from "@/lib/replay";
import { useInbox } from "@/lib/context";
import { TraceLine } from "@/components/FirewallTrace";
import { LiveIndicator, StatusReadout, liveStatus } from "@/components/StatusReadout";
import { Activity, ArrowRightLeft, Eye, Inbox, Landmark, Mail, ReceiptText, Send, Wallet, Zap, type LucideIcon } from "lucide-react";

const TOOL_ICON: Record<string, LucideIcon> = {
  list_emails: Inbox,
  read_email: Mail,
  send_email: Send,
  get_balance: Wallet,
  list_bills: ReceiptText,
  pay_bill: Landmark,
  transfer: ArrowRightLeft,
};

export default function SessionPage() {
  const session = useQuery(api.sessions.currentSession, {});
  const events = useQuery(api.events.eventsBySession, session ? { sessionId: session.id } : "skip");
  const envState = useQuery(api.envState.byScenario, session?.scenario ? { scenario: session.scenario } : "skip");
  const pending = useQuery(api.approvals.pendingApprovals, {});
  // Sender and subject per email id, from the scenario's inbox seed.
  const inbox = useInbox(session?.scenario);

  // Calls that were already on screen when the page opened don't animate; only
  // ones that arrive while it's open do (the beam snap, the row sliding in).
  // A session that starts after the page opened counts as entirely live.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  if (seen === null && session !== undefined) {
    if (session === null) setSeen(new Set());
    else if (events !== undefined) setSeen(new Set(events.map((e) => e.id)));
  }
  const isLive = (id: string) => seen !== null && !seen.has(id);

  if (session === undefined) {
    return <p className="display-caps text-xl text-muted">Connecting…</p>;
  }
  if (session === null) {
    return (
      <div className="flex flex-col gap-8">
        <Beam state="armed" />
        <EmptyState title="No session yet">
          Start one with <code className="text-foreground">pnpm agent --mode enforce</code> (or{" "}
          <code className="text-foreground">--mode off</code> to see the attack land). Calls show up here as they happen.
        </EmptyState>
      </div>
    );
  }

  const sorted = [...(events ?? [])].sort((a, b) => a.ts - b.ts);
  const newest = [...sorted].reverse();
  const off = session.mode === "off";
  const beamState: BeamState = off ? "off" : pending && pending.length > 0 ? "ask" : "armed";
  const marks: BeamMark[] = sorted.map((e, i) => ({
    at: (i + 1) / (sorted.length + 1),
    kind: e.decision === "block" ? "block" : e.decision === "ask" ? "ask" : e.kind === "sink" ? "pass" : "source",
    label: String(i + 1).padStart(2, "0"),
    title: `${String(i + 1).padStart(2, "0")} ${actionString(e)}: ${e.decision}`,
    href: `/event/${e.id}`,
    snap: e.decision === "block" && isLive(e.id),
  }));
  const liveBlocks = sorted.filter((e) => e.decision === "block" && isLive(e.id));
  const lastLiveBlock = liveBlocks[liveBlocks.length - 1];
  const stepOf = new Map(sorted.map((e, i) => [e.id, i + 1]));
  const attacker = envState?.attackerReceived;
  const status = liveStatus(session.mode, newest[0]?.decision, pending?.length ?? 0);
  const statusDetail =
    status === "block" && newest[0]
      ? `Stopped: ${actionString(newest[0])}`
      : status === "ask" && pending
        ? `${pending.length} action${pending.length === 1 ? "" : "s"} held for you`
        : undefined;

  return (
    <div className="flex flex-col gap-6 stage:gap-3">
      {/* One red pulse around the screen edge per block that arrives live. */}
      {lastLiveBlock && <div key={lastLiveBlock.id} className="edge-pulse" aria-hidden />}

      {/* The beam, with every call of this session on it */}
      <div className="-mt-6">
        <Beam state={beamState} marks={marks} showLabels />
      </div>

      {/* Console strip: mode and request on the left, then the two counters.
          The counter columns have fixed widths so nothing shifts when a number grows. */}
      <div className="-mt-3 grid gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
        <div className="flex min-w-0 flex-col gap-3">
          <StatusReadout
            status={status}
            mode={session.mode}
            backend={envState?.backend}
            detail={statusDetail}
          />
          <p className="border-l-2 border-mark pl-3 text-lg leading-snug">
            <span className="display-caps mr-2 text-sm text-muted">You asked</span>
            {session.intent ? (
              <span className="text-foreground">&ldquo;{session.intent}&rdquo;</span>
            ) : (
              <span className="text-muted">No request registered yet.</span>
            )}
          </p>
        </div>
        <div className="md:w-[24rem]">
          <Label>
            Balance{envState?.backend ? ` · ${envState.backend === "nessie" ? "Capital One Nessie" : "local bank"}` : ""}
          </Label>
          <BigNumber cents={envState?.balance} label="Balance" className="text-7xl md:text-[5.5rem]" showDelta />
        </div>
        <div className="md:w-[16.5rem] md:text-right">
          <Label>Sent to attacker</Label>
          <BigNumber
            cents={attacker}
            label="Sent to attacker"
            tone={attacker ? "block" : "muted"}
            className="text-5xl md:text-6xl"
          />
        </div>
      </div>

      {pending?.map((a) => {
        const ev = sorted.find((e) => e.id === a.eventId);
        return (
          <Link
            key={a.id}
            href={`/approve/${a.id}`}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-ask bg-ask-bg px-5 py-2 text-ask"
          >
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <DecisionIcon decision="ask" size={20} />
              <span className="display-caps whitespace-nowrap text-xl">Needs your OK</span>
              {ev && <span className="basis-full text-lg text-foreground md:basis-auto">{ev.reason}</span>}
            </span>
            <span className="display-caps text-xl underline underline-offset-4">Review</span>
          </Link>
        );
      })}

      {/* The flight recorder: newest call first, right under the beam */}
      <Panel
        title={
          <span className="flex items-center gap-3">
            <LiveIndicator live={!off} />
            Flight recorder
          </span>
        }
        aside={`${sorted.length} call${sorted.length === 1 ? "" : "s"}`} bodyClassName="">
        {sorted.length === 0 ? (
          <p className="px-5 py-6 text-muted">Armed and waiting for the agent&apos;s first tool call.</p>
        ) : (
          <ol className="divide-y divide-border">
            {newest.map((e) => {
              const t = actionText(e);
              const blocked = e.decision === "block";
              const email = e.tool === "read_email" ? inbox?.get(String(e.args.id)) : undefined;
              const ToolIcon = TOOL_ICON[e.tool] ?? Activity;
              return (
                <li key={e.id} className={isLive(e.id) ? "row-glow" : undefined}>
                  <Link
                    href={`/event/${e.id}`}
                    className={`grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-0.5 border-l-4 px-4 py-2.5 hover:bg-panel-raised stage:py-1.5 sm:grid-cols-[3.5rem_5.5rem_1fr_auto] sm:px-5 ${
                      blocked ? "border-block bg-block-bg/60" : e.decision === "ask" ? "border-ask" : "border-transparent"
                    }`}
                  >
                    <span className="font-mono text-base tabular-nums text-muted">
                      {String(stepOf.get(e.id)).padStart(2, "0")}
                    </span>
                    <span className="flex flex-col font-mono text-base tabular-nums text-muted">
                      +{formatClock(Math.max(0, e.ts - session.startedAt))}
                      {/* Reads pass straight through; actions are held until Tripwire decides. */}
                      <span className={`display-caps text-xs ${e.kind === "sink" ? "text-foreground" : "text-muted"}`}>
                        {e.kind === "sink" ? (
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
                    {/* Phones: step, time and chip on one line, the action full width below */}
                    <span className="order-last col-span-3 min-w-0 sm:order-none sm:col-span-1">
                      <span className={`block text-xl ${e.kind === "source" ? "text-muted" : "text-foreground"}`}>
                        <ToolIcon aria-hidden className="mr-2 inline-block h-5 w-5 -translate-y-0.5" strokeWidth={1.5} />
                        {t.verb}
                        {email?.subject ? (
                          <span className="ml-2 break-words text-foreground">&ldquo;{email.subject}&rdquo;</span>
                        ) : (
                          t.value && <span className={`ml-2 break-words font-bold ${blocked ? "text-block" : ""}`}>{t.value}</span>
                        )}
                      </span>
                      {email?.from && <span className="block text-base text-muted">from {email.from}</span>}
                      {e.kind !== "source" && <span className="block text-base text-muted sm:truncate">{e.reason}</span>}
                      {e.kind === "sink" && <TraceLine event={e} />}
                    </span>
                    <span className="justify-self-end">
                      <DecisionChip decision={e.decision} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel>
      <h1 className="display-caps text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">{children}</p>
    </Panel>
  );
}
