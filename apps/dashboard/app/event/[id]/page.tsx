"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { DecisionChip } from "@/components/DecisionChip";
import { formatUsd } from "@/lib/format";

/**
 * Deliberately a stub for the highlighted-source view: highlightSpanId/
 * highlightText (Nila's explanation work) don't exist yet, so this shows
 * the plain untrusted span text for the first taint hit instead of
 * guessing at a highlighting format that isn't settled. Swap this for the
 * real highlighter once those fields land on ToolCallEvent.
 */
export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const event = useQuery(api.events.eventById, { eventId: id });
  const firstTaintSpanId = event?.taintHits[0]?.spanId;
  const span = useQuery(api.spans.spanById, firstTaintSpanId ? { spanId: firstTaintSpanId } : "skip");

  if (event === undefined) return <p className="text-muted">Loading…</p>;
  if (event === null) return <p className="text-muted">No event with that id.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">
            {event.server}__{event.tool}
          </div>
          <div className="text-lg font-semibold">{event.reason}</div>
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

      {span && (
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-wide text-muted">
            Source — {span.server}__{span.tool} ({span.itemId})
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Highlighting of the exact injected sentence is coming soon. Full untrusted text below:
          </p>
          <p className="mt-2 whitespace-pre-wrap rounded bg-background p-3 text-sm">{span.text}</p>
        </div>
      )}

      {event.nessieId ? (
        <p className="text-sm text-allow">Nessie confirmation: {event.nessieId}</p>
      ) : event.kind === "sink" && event.decision === "allow" ? (
        <p className="text-sm text-muted">No Nessie transfer created.</p>
      ) : null}

      <p className="text-xs text-muted">Latency: {event.latencyMs}ms{event.args.amount ? ` · Amount: ${formatUsd(Number(event.args.amount) * 100)}` : ""}</p>
    </div>
  );
}
