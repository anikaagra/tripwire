"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { DecisionChip, DecisionIcon } from "@/components/DecisionChip";
import { formatUsd } from "@/lib/format";
import { EvidenceDocument, Explanation } from "@/components/Explanation";
import { Label, Panel } from "@/components/Panel";
import { explanationsOf } from "@/lib/replay";
import { actionText, plainHeadline, stripYouAsked } from "@/lib/actions";

/** explanation.headline is Tripwire's own call, before off/monitor mode or an approval changed it. */
const HEADLINE_DECISION: Record<string, string> = { Blocked: "block", "Needs your OK": "ask", Allowed: "allow" };

/**
 * The evidence view for one decision. The planted sentence comes from the
 * guard's explanation the proxy stores on each sink event; when the full
 * untrusted span (first taint hit) is loaded it's shown as the whole document
 * with that sentence lit up, otherwise as the sentence card from /replay.
 */
export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const event = useQuery(api.events.eventById, { eventId: id });
  const firstTaintSpanId = event?.taintHits[0]?.spanId;
  const span = useQuery(api.spans.spanById, firstTaintSpanId ? { spanId: firstTaintSpanId } : "skip");

  if (event === undefined) return <p className="display-caps text-xl text-muted">Loading the evidence…</p>;
  if (event === null) {
    return (
      <Panel>
        <h1 className="display-caps text-4xl">No call with that id</h1>
        <p className="mt-3 text-lg text-muted">
          It may be from a cleared session. Pick a call from the{" "}
          <Link href="/" className="text-foreground underline underline-offset-4">
            live session
          </Link>
          .
        </p>
      </Panel>
    );
  }

  const explanation = event.explanation;
  const ownCall = explanation ? HEADLINE_DECISION[explanation.headline] : undefined;
  const headline = plainHeadline(event);
  const tried = actionText(event);
  const blocked = event.decision === "block";
  const tone = blocked ? "text-block" : event.decision === "ask" ? "text-ask" : "text-foreground";

  // The sentence that lives in the loaded span gets the full-document view; any others use the card.
  const docSource =
    span && explanation?.sources.find((s) => s.spanId === span.id && s.end <= span.text.length && s.start < s.end);
  const otherItems = explanationsOf({
    explanation: explanation ? { sources: explanation.sources.filter((s) => s !== docSource) } : undefined,
  });

  const bankSink = event.server === "bank" && event.kind === "sink";

  return (
    <div className="flex flex-col gap-6 stage:gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 font-mono text-base text-muted">
        <Link href="/" className="hover:text-foreground">
          ← Live session
        </Link>
        <span>
          {event.server}__{event.tool} · {event.latencyMs} ms
        </span>
      </div>

      {/* Verdict: chip, one line in big type, and the bank outcome */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="self-start">
            <DecisionChip decision={event.decision} size="lg" />
          </span>
          <h1 className={`display-caps leading-[1.05] ${event.decision === "allow" ? "text-3xl" : "text-4xl md:text-5xl stage:md:text-[2.75rem]"} ${tone}`}>{headline ?? event.reason}</h1>
          {headline && <p className="text-lg text-muted">{event.reason}</p>}
          {ownCall && ownCall !== event.decision && (
            <p className="text-base text-muted">
              Tripwire&apos;s own call was <span className="font-bold text-foreground">{explanation!.headline}</span>; the
              final result changed because of the session mode or your approval.
            </p>
          )}
        </div>
        {bankSink && <NessieOutcome nessieId={event.nessieId} blocked={blocked} />}
      </div>

      {/* What you asked for vs. what the agent tried */}
      <div className="grid border border-border md:grid-cols-2">
        <div className="border-b border-border p-5 stage:py-3 md:border-b-0 md:border-r">
          <Label>You asked</Label>
          <p className="mt-1 text-xl text-foreground">
            {explanation ? (
              <>&ldquo;{stripYouAsked(explanation.youAsked)}&rdquo;</>
            ) : (
              <span className="text-muted">Not recorded for this call.</span>
            )}
          </p>
        </div>
        <div className={`p-5 stage:py-3 ${blocked ? "bg-block-bg/60" : ""}`}>
          <Label>The agent tried</Label>
          <p className="mt-1 text-xl text-foreground">
            {tried.verb}
            {tried.value && <span className={`ml-2 break-words font-bold ${blocked ? "text-block" : ""}`}>{tried.value}</span>}
          </p>
        </div>
      </div>

      {/* The evidence */}
      {docSource && span ? (
        <EvidenceDocument
          text={span.text}
          start={docSource.start}
          end={docSource.end}
          value={docSource.value}
          hidden={docSource.hidden}
          hiddenHow={docSource.hiddenHow}
          title={`From ${docSource.where}`}
          meta={`${span.server}__${span.tool} · ${span.itemId}`}
        />
      ) : (
        span &&
        !explanation && (
          // Older events: no explanation stored, but we still have the tainted source.
          <Panel title={`Source · ${span.server}__${span.tool} (${span.itemId})`}>
            <p className="whitespace-pre-wrap font-mono text-lg leading-relaxed text-muted">{span.text}</p>
          </Panel>
        )
      )}
      <Explanation items={otherItems} />

      {/* Everything else, for the curious */}
      <details className="group border border-border bg-panel">
        <summary className="display-caps cursor-pointer list-none px-5 py-3 text-base text-muted hover:text-foreground">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          Raw details: rules, tainted arguments, arguments
        </summary>
        <div className="grid gap-6 border-t border-border p-5 md:grid-cols-2">
          <div>
            <Label>Arguments</Label>
            <pre className="mt-2 overflow-x-auto border border-border bg-background p-3 font-mono text-base">
              {JSON.stringify(event.args, null, 2)}
            </pre>
            <p className="mt-2 font-mono text-sm text-muted">
              Latency {event.latencyMs} ms
              {event.args.amount ? ` · amount ${formatUsd(Number(event.args.amount) * 100)}` : ""}
            </p>
          </div>
          <div>
            <Label>Rules and taint</Label>
            {event.ruleHits.length === 0 && event.taintHits.length === 0 ? (
              <p className="mt-2 text-muted">Nothing fired.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-base">
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
      </details>
    </div>
  );
}

/** Did the bank call reach Nessie? Big, so it reads from the back row. */
function NessieOutcome({ nessieId, blocked }: { nessieId?: string; blocked: boolean }) {
  if (nessieId) {
    return (
      <div className="relative border border-border bg-panel px-5 py-4 md:max-w-xs">
        <Label>Nessie</Label>
        <p className="display-caps mt-1 text-2xl text-foreground">Record created</p>
        <p className="mt-1 break-all font-mono text-sm text-muted">{nessieId}</p>
      </div>
    );
  }
  if (!blocked) return null;
  return (
    <div className="flex items-center gap-4 border border-allow/60 bg-allow-bg px-5 py-4 text-allow md:max-w-xs">
      <DecisionIcon decision="allow" size={28} />
      <div>
        <p className="display-caps text-3xl leading-none">No Nessie transfer created</p>
        <p className="mt-1.5 text-base text-muted">Stopped before it reached the bank.</p>
      </div>
    </div>
  );
}
