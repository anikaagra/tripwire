"use client";

import type { ReactNode } from "react";
import { DecisionChip } from "@/components/DecisionChip";
import { Label, Panel } from "@/components/Panel";
import { usePolicy, type ToolPolicyView } from "@/lib/context";
import { MATRIX, rowLit, traceOf, type Trace } from "@/lib/trace";

interface TraceableEvent {
  server: string;
  tool: string;
  kind: string;
  args: Record<string, unknown>;
  decision: string;
  latencyMs: number;
  ruleHits: { rule: string; detail: string }[];
  taintHits: { argKey: string; value: string; spanId: string }[];
  explanation?: { headline: string; youAsked: string; sources: { value: string; where: string; spanId: string }[] };
}

type Tone = "plain" | "ask" | "block" | "muted";

const TONE_TEXT: Record<Tone, string> = {
  plain: "text-allow",
  ask: "text-ask",
  block: "text-block",
  muted: "text-muted",
};
const TONE_NODE: Record<Tone, string> = {
  plain: "bg-allow",
  ask: "bg-ask shadow-[0_0_10px_rgb(255_176_32/0.8)]",
  block: "bg-block shadow-[0_0_10px_rgb(255_42_42/0.9)]",
  muted: "bg-mark",
};

/**
 * The guard pipeline for one sink call, checkpoint by checkpoint, from what the
 * proxy actually stored: the policy entry that classified the tool, which rules
 * fired, which arguments traced back to text the agent read, what the judge was
 * shown (and not shown), and the row of the decision table the call went through.
 */
export function FirewallTrace({ event }: { event: TraceableEvent }) {
  const policy = usePolicy();
  const trace = traceOf(event);
  if (!trace) return null;

  const qualified = `${event.server}__${event.tool}`;
  const entry = policy?.[qualified];

  return (
    <Panel
      title="How Tripwire decided"
      aside={`${event.latencyMs} ms · every action that can move money or send data goes through these checks`}
      bodyClassName="px-5 pb-5 pt-1"
    >
      <ol className="relative grid gap-x-6 gap-y-6 md:grid-cols-4">
        {/* The beam the checkpoints sit on */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[1.3125rem] hidden h-px bg-block/50 shadow-[0_0_6px_rgb(255_42_42/0.6)] md:block" />
        <Checkpoint n={1} title="Intercept" status="Held" tone="plain">
          <p>
            <code className="text-foreground">{qualified}</code> is a{" "}
            <span className="text-foreground">
              {entry ? `${entry.kind}${entry.risk ? ` · ${entry.risk} risk` : ""}` : "sink"}
            </span>{" "}
            in <code>tripwire.policy.yaml</code>, so the proxy held it. The bank never saw the call while Tripwire decided.
          </p>
        </Checkpoint>
        <RulesCheckpoint event={event} trace={trace} entry={entry} />
        <TaintCheckpoint event={event} trace={trace} />
        <JudgeCheckpoint trace={trace} entry={entry} />
      </ol>

      <DecisionTable trace={trace} />
    </Panel>
  );
}

function Checkpoint({
  n,
  title,
  status,
  tone,
  children,
}: {
  n: number;
  title: string;
  status: string;
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <li className="relative flex min-w-0 flex-col gap-2 pt-4">
      <span aria-hidden className={`relative z-10 h-2.5 w-2.5 rounded-full ${TONE_NODE[tone]}`} />
      <span className="display-caps mt-1 text-sm text-muted">
        {String(n).padStart(2, "0")} · {title}
      </span>
      <span className={`display-caps text-2xl leading-none ${TONE_TEXT[tone]}`}>{status}</span>
      <div className="flex flex-col gap-1.5 text-base leading-snug text-muted">{children}</div>
    </li>
  );
}

/** "Amount 200000 cents exceeds the 50000 cent limit." -> "Amount $2,000.00 exceeds the $500.00 limit." */
function centsToDollars(detail: string): string {
  return detail.replace(/(\d+) cents?/g, (_, n: string) => usd(Number(n)));
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function RulesCheckpoint({ event, trace, entry }: { event: TraceableEvent; trace: Trace; entry?: ToolPolicyView }) {
  const configured: string[] = [];
  if (entry?.rules?.maxAmountCents !== undefined) configured.push(`limit ${usd(entry.rules.maxAmountCents)}`);
  if (entry?.rules?.recipientAllowlist?.length) configured.push(`allowlist: ${entry.rules.recipientAllowlist.join(", ")}`);
  if (entry?.rules?.alwaysAsk) configured.push("always ask");

  return (
    <Checkpoint n={2} title="Policy rules" status={trace.rules === "escalate" ? "Escalate" : "Pass"} tone={trace.rules === "escalate" ? "ask" : "plain"}>
      {event.ruleHits.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {event.ruleHits.map((r, i) => (
            <li key={i}>
              <code className="text-ask">{r.rule}</code> {centsToDollars(r.detail)}
            </li>
          ))}
        </ul>
      ) : (
        <p>No rule fired.</p>
      )}
      <p className="text-sm">{configured.length > 0 ? `Configured: ${configured.join(" · ")}` : "No rules configured for this tool."}</p>
    </Checkpoint>
  );
}

function TaintCheckpoint({ event, trace }: { event: TraceableEvent; trace: Trace }) {
  const whereOf = (value: string) => event.explanation?.sources.find((s) => s.value === value)?.where ?? "text the agent read";
  return (
    <Checkpoint n={3} title="Provenance" status={trace.tainted ? "Tainted" : "Clean"} tone={trace.tainted ? "block" : "plain"}>
      {trace.tainted ? (
        <ul className="flex flex-col gap-1">
          {event.taintHits.map((h, i) => (
            <li key={i}>
              <code className="text-foreground">{h.argKey}</code> ={" "}
              <code className="font-bold text-block">{h.value}</code> appears in {whereOf(h.value)}, not in your request.
            </li>
          ))}
        </ul>
      ) : (
        <p>Every argument traces to your request or your own bank data, not to anything the agent read.</p>
      )}
      <p className="text-sm">Each email and page the agent reads is stored as untrusted text and checked against the call.</p>
    </Checkpoint>
  );
}

function JudgeCheckpoint({ trace, entry }: { trace: Trace; entry?: ToolPolicyView }) {
  const status =
    trace.judge === "yes" ? "Requested" : trace.judge === "no" ? "Not requested" : trace.judge === "either" ? "Not needed" : "Unknown";
  const tone: Tone = trace.judge === "yes" ? "plain" : trace.judge === "no" ? "block" : "muted";

  return (
    <Checkpoint n={4} title="Judge · Claude Haiku" status={status} tone={tone}>
      <p>
        {trace.judge === "either"
          ? "Rules and provenance already decide this one: it blocks whatever the judge says."
          : trace.judge
            ? "Asked whether you requested this action. Answer read back from the decision table."
            : "This event predates the stored explanation, so the answer can't be read back."}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 border-l border-border pl-3 text-sm">
        <li>
          <span className="display-caps mr-2 text-muted">Sees</span>
          <span className="text-foreground">your request · the tool · our description · the arguments</span>
        </li>
        <li>
          <span className="display-caps mr-2 text-block">Never</span>
          <span className="text-foreground">the email or anything else the agent read</span>
        </li>
      </ul>
      {entry && <p className="text-sm">Our description: &ldquo;{entry.trustedDescription}&rdquo;</p>}
    </Checkpoint>
  );
}

const CELL: Record<string, string> = {
  pass: "pass",
  escalate: "escalate",
  clean: "clean",
  hit: "tainted",
  any: "either",
  yes: "requested",
  no: "not requested",
};

function DecisionTable({ trace }: { trace: Trace }) {
  return (
    <div className="mt-6 grid gap-5 border-t border-border pt-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <Label>05 · Decision table, the only way these combine</Label>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse font-mono text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-4 font-normal">Rules</th>
                <th className="py-1 pr-4 font-normal">Provenance</th>
                <th className="py-1 pr-4 font-normal">Judge</th>
                <th className="py-1 font-normal">Result</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row, i) => {
                const lit = rowLit(row, trace);
                const resultTone = row.result === "block" ? "text-block" : row.result === "ask" ? "text-ask" : "text-allow";
                return (
                  <tr
                    key={i}
                    className={`border-t border-border/60 ${lit ? "bg-panel-raised text-foreground" : "text-muted/70"}`}
                    aria-current={lit ? "true" : undefined}
                  >
                    <td className={`py-1 pr-4 ${lit ? "border-l-2 border-foreground pl-2" : "pl-2.5"}`}>{CELL[row.rules]}</td>
                    <td className="py-1 pr-4">{CELL[row.taint]}</td>
                    <td className="py-1 pr-4">{CELL[row.judge]}</td>
                    <td className={`py-1 font-bold uppercase ${lit ? resultTone : ""}`}>{row.result}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <Label>Tripwire&apos;s call</Label>
        <DecisionChip decision={trace.guard} size="lg" />
      </div>
    </div>
  );
}

/** One line per sink row on the live page: the three checks and how they came out. */
export function TraceLine({ event }: { event: Pick<TraceableEvent, "kind" | "decision" | "ruleHits" | "taintHits" | "explanation"> }) {
  const t = traceOf(event);
  if (!t) return null;
  const judge =
    t.judge === "yes"
      ? { word: "requested", tone: "text-allow" }
      : t.judge === "no"
        ? { word: "not requested", tone: "text-block" }
        : { word: "not needed", tone: "text-muted" };
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-4 font-mono text-sm text-muted">
      <span>
        rules <span className={t.rules === "escalate" ? "text-ask" : "text-allow"}>{t.rules}</span>
      </span>
      <span>
        provenance{" "}
        <span className={t.tainted ? "text-block" : "text-allow"}>
          {t.tainted ? `tainted (${event.taintHits.map((h) => h.value).join(", ")})` : "clean"}
        </span>
      </span>
      <span>
        judge <span className={judge.tone}>{judge.word}</span>
      </span>
    </span>
  );
}
