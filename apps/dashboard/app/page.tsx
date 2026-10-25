"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { ArmSwitch } from "@/components/ArmSwitch";
import { Beam, type BeamMark, type BeamState } from "@/components/Beam";
import { BigNumber } from "@/components/BigNumber";
import { DecisionChip, DecisionIcon } from "@/components/DecisionChip";
import { Label, Panel } from "@/components/Panel";
import { actionString, actionText } from "@/lib/actions";
import { formatClock } from "@/lib/replay";

export default function SessionPage() {
  const session = useQuery(api.sessions.currentSession, {});
  const events = useQuery(api.events.eventsBySession, session ? { sessionId: session.id } : "skip");
  const envState = useQuery(api.envState.byScenario, session?.scenario ? { scenario: session.scenario } : "skip");
  const pending = useQuery(api.approvals.pendingApprovals, {});

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

  return (
    <div className="flex flex-col gap-6">
      {/* One red pulse around the screen edge per block that arrives live. */}
      {lastLiveBlock && <div key={lastLiveBlock.id} className="edge-pulse" aria-hidden />}

      {/* The beam, with every call of this session on it */}
      <div className="-mt-6">
        <Beam state={beamState} marks={marks} showLabels />
      </div>

      {/* Console strip: mode, balance, attacker */}
      <div className="-mt-2 grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-end">
        <ArmSwitch mode={session.mode} />
        <div className="md:justify-self-center">
          <Label>
            Balance{envState?.backend ? ` · ${envState.backend === "nessie" ? "Capital One Nessie" : "local bank"}` : ""}
          </Label>
          <BigNumber cents={envState?.balance} label="Balance" className="text-7xl md:text-8xl" showDelta />
        </div>
        <div className="md:text-right">
          <Label>Sent to attacker</Label>
          <BigNumber
            cents={attacker}
            label="Sent to attacker"
            tone={attacker ? "block" : "muted"}
            className="text-5xl md:text-6xl"
          />
        </div>
      </div>

      <p className="border-l-2 border-mark pl-4 text-xl">
        <span className="display-caps mr-3 text-base text-muted">You asked</span>
        {session.intent ? (
          <span className="text-foreground">&ldquo;{session.intent}&rdquo;</span>
        ) : (
          <span className="text-muted">No request registered yet.</span>
        )}
      </p>

      {pending?.map((a) => {
        const ev = sorted.find((e) => e.id === a.eventId);
        return (
          <Link
            key={a.id}
            href={`/approve/${a.id}`}
            className="flex flex-wrap items-center justify-between gap-4 border border-ask bg-ask-bg px-5 py-3 text-ask"
          >
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <DecisionIcon decision="ask" size={22} />
              <span className="display-caps whitespace-nowrap text-2xl">Needs your OK</span>
              {ev && <span className="basis-full text-lg text-foreground md:basis-auto">{ev.reason}</span>}
            </span>
            <span className="display-caps text-xl underline underline-offset-4">Review</span>
          </Link>
        );
      })}

      {/* The flight recorder: newest call first, right under the beam */}
      <Panel title="Flight recorder" aside={`${sorted.length} call${sorted.length === 1 ? "" : "s"}`} bodyClassName="">
        {sorted.length === 0 ? (
          <p className="px-5 py-6 text-muted">Armed and waiting for the agent&apos;s first tool call.</p>
        ) : (
          <ol className="divide-y divide-border">
            {newest.map((e) => {
              const t = actionText(e);
              const blocked = e.decision === "block";
              return (
                <li key={e.id} className={isLive(e.id) ? "row-enter" : undefined}>
                  <Link
                    href={`/event/${e.id}`}
                    className={`grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-1 border-l-4 px-4 py-3.5 hover:bg-panel-raised sm:grid-cols-[3.5rem_5.5rem_1fr_auto] sm:px-5 ${
                      blocked ? "border-block bg-block-bg/60" : e.decision === "ask" ? "border-ask" : "border-transparent"
                    }`}
                  >
                    <span className="font-mono text-base tabular-nums text-muted">
                      {String(stepOf.get(e.id)).padStart(2, "0")}
                    </span>
                    <span className="font-mono text-base tabular-nums text-muted">
                      +{formatClock(Math.max(0, e.ts - session.startedAt))}
                    </span>
                    {/* Phones: step, time and chip on one line, the action full width below */}
                    <span className="order-last col-span-3 min-w-0 sm:order-none sm:col-span-1">
                      <span className={`block text-xl ${e.kind === "source" ? "text-muted" : "text-foreground"}`}>
                        {t.verb}
                        {t.value && <span className={`ml-2 break-words font-bold ${blocked ? "text-block" : ""}`}>{t.value}</span>}
                      </span>
                      {e.kind !== "source" && <span className="block text-base text-muted">{e.reason}</span>}
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
