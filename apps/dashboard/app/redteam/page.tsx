"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api, type AttackDoc } from "@/lib/api";
import { Panel } from "@/components/Panel";
import { byGoal, describeOutcome } from "@/lib/redteam";

interface Metrics {
  mode: "off" | "enforce";
  profile: string;
  model: string;
  backend: string;
  total: number;
  succeeded: number;
  blocked: number;
  asked: number;
  notAttempted: number;
  errored: number;
  benignFalsePositives: number;
  benignTotal: number;
}

const BACKEND_NAMES: Record<string, string> = { nessie: "Capital One Nessie", local: "local bank" };

/**
 * Target-practice scoreboard: the newest off run against the newest enforce
 * run, one cell per attack. Every count comes from the saved runs.
 */
export default function RedTeamPage() {
  const runs = useQuery(api.redteam.recentRuns, { limit: 20 });
  const offRun = runs?.find((r) => (r.metrics as Metrics | undefined)?.mode === "off");
  const enforceRun = runs?.find((r) => (r.metrics as Metrics | undefined)?.mode === "enforce");
  const offAttacks = useQuery(api.redteam.attacksByRun, offRun ? { runId: offRun.id } : "skip");
  const enforceAttacks = useQuery(api.redteam.attacksByRun, enforceRun ? { runId: enforceRun.id } : "skip");

  if (runs === undefined) return <p className="display-caps text-xl text-muted">Loading the scoreboard…</p>;

  const off = offRun?.metrics as Metrics | undefined;
  const on = enforceRun?.metrics as Metrics | undefined;

  if (!off && !on) {
    return (
      <Panel>
        <h1 className="display-caps text-4xl">No Red Team runs yet</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted">
          Run the suite once without Tripwire and once with it:
        </p>
        <pre className="mt-3 overflow-x-auto border border-border bg-background p-4 font-mono text-base text-foreground">
          {"pnpm redteam --mode off --profile compromised\npnpm redteam --mode enforce --profile compromised"}
        </pre>
        <p className="mt-3 text-base text-muted">The enforce run needs the proxy. Results show up here as each run finishes.</p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6 stage:gap-4">
      {/* The headline */}
      <div className="flex flex-col gap-2">
        {off && on ? (
          <h1 className="display-caps text-5xl leading-[1.02] md:text-[3.35rem]">
            Fell for{" "}
            <span className="text-block">
              {off.succeeded} / {off.total}
            </span>{" "}
            without Tripwire.{" "}
            <span className={on.succeeded === 0 ? "text-allow" : "text-block"}>{on.succeeded}</span> with it.
          </h1>
        ) : (
          <h1 className="display-caps text-4xl leading-tight">
            Need both runs to compare <span className="text-muted">(missing: {off ? "enforce" : "off"})</span>
          </h1>
        )}
        <p className="text-lg text-muted">
          {[runFacts(off), runFacts(on)].filter(Boolean)[0]}
          {off && on && off.total !== on.total && ` · the two runs used different suites (${off.total} vs ${on.total} attacks)`}
        </p>
        {off?.profile === "compromised" && (
          <p className="max-w-4xl text-base text-muted">
            The run without Tripwire uses a simulated compromised agent (<code className="text-foreground">--profile compromised</code>),
            because current Claude models refuse most of these injections on their own. It shows what happens when one doesn&apos;t.
          </p>
        )}
      </div>

      {/* The two target boards */}
      <div className="grid gap-6 stage:gap-4 lg:grid-cols-2">
        {off && (
          <Board
            title="Without Tripwire"
            aside={`${off.succeeded} of ${off.total} landed`}
            attacks={offAttacks}
            tone="block"
          />
        )}
        {on && (
          <Board
            title="With Tripwire"
            aside={`${on.blocked} blocked · ${on.asked} held · ${on.succeeded} landed`}
            attacks={enforceAttacks}
            tone="allow"
          />
        )}
      </div>

      {/* False positives and the legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-border pt-4">
        {on && (
          <p className="text-xl">
            <span className="display-caps mr-3 text-base text-muted">Everyday tasks blocked by mistake</span>
            {on.benignTotal > 0 ? (
              <span className={on.benignFalsePositives === 0 ? "text-allow" : "text-ask"}>
                <span className="font-display text-3xl font-bold">{on.benignFalsePositives}</span> of {on.benignTotal}
              </span>
            ) : (
              <span className="text-muted">benign suite not run</span>
            )}
          </p>
        )}
        <Legend />
      </div>
    </div>
  );
}

function runFacts(m: Metrics | undefined): string | null {
  if (!m) return null;
  return [`${m.total} attacks`, BACKEND_NAMES[m.backend] ?? m.backend, `${m.profile} profile`, m.model].filter(Boolean).join(" · ");
}

function Board({
  title,
  aside,
  attacks,
  tone,
}: {
  title: string;
  aside: string;
  attacks: AttackDoc[] | undefined;
  tone: "block" | "allow";
}) {
  const rows = attacks ? byGoal(attacks) : [];
  return (
    <Panel
      title={<span className={tone === "block" ? "text-block" : "text-foreground"}>{title}</span>}
      aside={aside}
      bodyClassName="flex flex-col gap-4 p-5 stage:gap-3 stage:py-4"
    >
      {attacks === undefined ? (
        <p className="text-muted">Loading attacks…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted">No per-attack results saved for this run.</p>
      ) : (
        rows.map((row) => (
          <div key={row.goal}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-lg text-foreground">{row.label}</span>
              <span className={`whitespace-nowrap font-mono text-base ${row.landed > 0 ? "text-block" : "text-muted"}`}>
                {row.landed}/{row.attacks.length} landed
              </span>
            </div>
            <ul className="flex flex-wrap gap-1.5" aria-label={`${row.label}: ${row.landed} of ${row.attacks.length} landed`}>
              {row.attacks.map((a) => (
                <li key={a.id}>
                  <Cell attack={a} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </Panel>
  );
}

/** One target. Red fill = the attack landed; struck through = blocked; amber = held for approval. */
function Cell({ attack }: { attack: AttackDoc }) {
  const title = `${attack.carrier} · ${attack.technique}: ${describeOutcome(attack.outcome)}`;
  const body = <CellMark outcome={attack.outcome} />;
  const eventId = attack.eventIds[attack.eventIds.length - 1];
  const cls = "block h-8 w-8 stage:h-7 stage:w-7";
  return eventId ? (
    <Link href={`/event/${eventId}`} className={cls} title={title} aria-label={title}>
      {body}
    </Link>
  ) : (
    <span className={cls} title={title} role="img" aria-label={title}>
      {body}
    </span>
  );
}

function CellMark({ outcome }: { outcome: string }) {
  switch (outcome) {
    case "succeeded":
      return <span className="block h-full w-full border border-block bg-block shadow-[0_0_8px_rgb(255_42_42/0.45)]" />;
    case "blocked":
      return (
        <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
          <rect x="1" y="1" width="30" height="30" fill="none" stroke="var(--allow)" strokeOpacity="0.7" strokeWidth="2" />
          <path d="M5 27 L27 5" stroke="var(--allow)" strokeWidth="2.5" />
        </svg>
      );
    case "asked":
      return (
        <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
          <rect x="1" y="1" width="30" height="30" fill="var(--ask-bg)" stroke="var(--ask)" strokeWidth="2" />
          <path d="M16 8 L24 23 H8 Z" fill="var(--ask)" />
        </svg>
      );
    case "errored":
      return <span className="block h-full w-full border border-dashed border-muted" />;
    default: // not_attempted
      return <span className="block h-full w-full border border-mark" />;
  }
}

function Legend() {
  const item = (outcome: string, text: string) => (
    <span className="flex items-center gap-2">
      <span className="block h-5 w-5">
        <CellMark outcome={outcome} />
      </span>
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-sm text-muted">
      {item("succeeded", "landed")}
      {item("blocked", "blocked")}
      {item("asked", "held for OK")}
      {item("not_attempted", "not tried")}
    </div>
  );
}
