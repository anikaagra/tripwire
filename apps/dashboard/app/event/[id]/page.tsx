"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { DecisionChip } from "@/components/DecisionChip";
import { formatUsd } from "@/lib/format";
import { Explanation } from "@/components/Explanation";
import { explanationsOf } from "@/lib/replay";

/** explanation.headline is Tripwire's own call, before off/monitor mode or an approval changed it. */
const HEADLINE_DECISION: Record<string, string> = { Blocked: "block", "Needs your OK": "ask", Allowed: "allow" };

/**
 * The injected sentence comes from the guard's explanation the proxy stores
 * on each sink event (rendered with the same Explanation card as /replay);
 * the full untrusted span text for the first taint hit sits below it.
 */
export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const event = useQuery(api.events.eventById, { eventId: id });
  const firstTaintSpanId = event?.taintHits[0]?.spanId;
  const span = useQuery(api.spans.spanById, firstTaintSpanId ? { spanId: firstTaintSpanId } : "skip");

  if (event === undefined) return <p className="text-muted">Loading…</p>;
  if (event === null) return <p className="text-muted">No event with that id.</p>;

  const explanation = event.explanation;
  const ownCall = explanation ? HEADLINE_DECISION[explanation.headline] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <div className="text-xs uppercase tracking-wide text-muted">
            {event.server}__{event.tool}
          </div>
          {explanation && <div className="text-base text-muted">{explanation.youAsked}</div>}
          <div className="text-lg font-semibold">{event.reason}</div>
          {ownCall && ownCall !== event.decision && (
            <div className="text-sm text-muted">
              Tripwire&apos;s own call was <span className="font-semibold">{explanation!.headline}</span>; the final
              result changed because of the session mode or your approval.
            </div>
          )}
        </div>
        <DecisionChip decision={event.decision} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-wide text-muted">Arguments</div>
          <pre className="mt-2 overflow-x-auto rounded bg-background p-3 text-sm">{JSON.stringify(event.args, null, 2)}</pre>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-wide text-muted">Rules + taint</div>
          {event.ruleHits.length === 0 && event.taintHits.length === 0 ? (
            <p className="mt-2 text-muted">Nothing fired.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {event.ruleHits.map((r, i) => (
                <li key={`rule-${i}`}>
                  <span className="font-mono text-ask">{r.rule}</span> — {r.detail}
                </li>
              ))}
              {event.taintHits.map((t, i) => (
                <li key={`taint-${i}`}>
                  <span className="font-mono text-block">{t.argKey}</span> = &quot;{t.value}&quot; came from an
                  untrusted span
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Explanation items={explanationsOf(event)} />

      {span && (
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-wide text-muted">
            Source — {span.server}__{span.tool} ({span.itemId})
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">Full untrusted text:</p>
          <p className="mt-2 whitespace-pre-wrap rounded bg-background p-3 text-sm">{span.text}</p>
        </div>
      )}

      {event.nessieId ? (
        <p className="text-sm text-allow">Nessie confirmation: {event.nessieId}</p>
      ) : event.server === "bank" && event.kind === "sink" && event.decision === "block" ? (
        <p className="text-sm font-semibold text-allow">No Nessie transfer created.</p>
      ) : null}

      <p className="text-xs text-muted">Latency: {event.latencyMs}ms{event.args.amount ? ` · Amount: ${formatUsd(Number(event.args.amount) * 100)}` : ""}</p>
    </div>
  );
}
