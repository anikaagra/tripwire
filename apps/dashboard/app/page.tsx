"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { DecisionChip } from "@/components/DecisionChip";
import { formatTime, formatUsd } from "@/lib/format";

export default function SessionPage() {
  const session = useQuery(api.sessions.currentSession, {});
  const events = useQuery(api.events.eventsBySession, session ? { sessionId: session.id } : "skip");
  const envState = useQuery(api.envState.byScenario, session?.scenario ? { scenario: session.scenario } : "skip");
  const pending = useQuery(api.approvals.pendingApprovals, {});

  if (session === undefined) {
    return <p className="text-muted">Loading…</p>;
  }
  if (session === null) {
    return <p className="text-muted">No session yet. Run the agent harness or connect through the proxy to start one.</p>;
  }

  const sorted = [...(events ?? [])].sort((a, b) => a.ts - b.ts);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Mode</div>
          <div className="text-2xl font-bold">{session.mode}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Balance</div>
          <div className="text-2xl font-bold">{formatUsd(envState?.balance)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Backend</div>
          <div className="text-2xl font-bold capitalize">{envState?.backend ?? "—"}</div>
        </div>
        <div className="min-w-[16rem] flex-1">
          <div className="text-xs uppercase tracking-wide text-muted">Intent</div>
          <div className="text-sm">{session.intent || <span className="text-muted">none registered</span>}</div>
        </div>
      </div>

      {pending && pending.length > 0 && (
        <div className="flex flex-col gap-2">
          {pending.map((a) => (
            <Link
              key={a.id}
              href={`/approve/${a.id}`}
              className="flex items-center justify-between rounded-lg border border-ask bg-ask-bg px-5 py-3 font-medium text-ask"
            >
              <span>Tripwire is asking for your approval</span>
              <span className="underline">Review →</span>
            </Link>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Timeline
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 py-6 text-muted">No tool calls yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/event/${event.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-background"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm text-muted">{formatTime(event.ts)}</span>
                    <span className="font-medium">
                      {event.server}__{event.tool}
                    </span>
                  </div>
                  <DecisionChip decision={event.decision} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
