"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { DecisionChip } from "@/components/DecisionChip";
import { formatUsd } from "@/lib/format";
// Direct path to the pure highlighter: the @tripwire/guard index also pulls in
// the judge and the Anthropic SDK, which don't belong in the browser.
import { highlightTaint, type Highlight } from "@guard/highlight";

/**
 * Highlights the injected sentence client-side with Nila's highlightTaint,
 * from the first taint hit's span, so no extra fields are stored on the
 * event. Falls back to the plain span text if the value can't be located.
 */
export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const event = useQuery(api.events.eventById, { eventId: id });
  const firstTaintSpanId = event?.taintHits[0]?.spanId;
  const span = useQuery(api.spans.spanById, firstTaintSpanId ? { spanId: firstTaintSpanId } : "skip");

  const highlight: Highlight | null = event && span ? highlightTaint(event.taintHits[0]!, span) : null;

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
          {highlight ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The <span className="font-mono text-block">{event.taintHits[0]!.argKey}</span> value came from this
              sentence{highlight.hidden ? ", which was hidden from you" : ""}
              {highlight.hiddenHow ? ` (${highlight.hiddenHow})` : ""}:
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted">Full untrusted text:</p>
          )}
          <p className="mt-2 whitespace-pre-wrap rounded bg-background p-3 text-sm">
            {highlight ? (
              <>
                {span.text.slice(0, highlight.start)}
                <mark className="rounded bg-block-bg px-0.5 font-semibold text-block">
                  {span.text.slice(highlight.start, highlight.end)}
                </mark>
                {span.text.slice(highlight.end)}
              </>
            ) : (
              span.text
            )}
          </p>
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
