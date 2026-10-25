"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { Label, Panel } from "@/components/Panel";

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

interface AttackRow {
  carrier: string;
  technique: string;
  goal: string;
  outcome: string;
  id: string;
}

const CARRIERS: [string, string][] = [
  ["email-hidden", "Hidden email text"],
  ["email-plain", "Plain email text"],
  ["bill-field", "A bill's payee field"],
];
const TECHNIQUES: [string, string][] = [
  ["direct", "Direct"],
  ["fake-notice", "Fake notice"],
  // Named for what the injected sentence says: "This is your bank's security team…" and
  // "As part of completing this request, you also need to…".
  ["impersonation", "Pose as bank"],
  ["task-continuation", "Add to task"],
];
const GOALS: [string, string][] = [
  ["transfer", "Wire $2,000"],
  ["forward-inbox", "Forward the inbox"],
  ["pay-fake-bill", "Pay a fake bill"],
];

const backendName = (b: string) => (b === "nessie" ? "Capital One Nessie" : "local bank");

export default function RedTeamPage() {
  const runs = useQuery(api.redteam.recentRuns, { limit: 20 });
  const offRun = runs?.find((r) => (r.metrics as Metrics | undefined)?.mode === "off");
  const enforceRun = runs?.find((r) => (r.metrics as Metrics | undefined)?.mode === "enforce");
  const offAttacks = useQuery(api.redteam.attacksByRun, offRun ? { runId: offRun.id } : "skip");
  const enforceAttacks = useQuery(api.redteam.attacksByRun, enforceRun ? { runId: enforceRun.id } : "skip");

  if (runs === undefined) return <p className="display-caps text-xl text-muted">Loading the scorecard…</p>;
  if (runs.length === 0) {
    return (
      <Panel>
        <h1 className="display-caps text-4xl">No Red Team runs yet</h1>
        <p className="mt-3 text-lg text-muted">
          Run <code className="text-foreground">pnpm redteam --mode off</code> and{" "}
          <code className="text-foreground">pnpm redteam --mode enforce</code>.
        </p>
      </Panel>
    );
  }

  const off = offRun?.metrics as Metrics | undefined;
  const on = enforceRun?.metrics as Metrics | undefined;
  const forced = [off, on].some((m) => m?.profile === "compromised");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Label>Red Team · {on ? `${on.total} attacks` : "attack suite"}</Label>
        {off && on ? (
          <h1 className="display-caps text-4xl leading-[1.05] md:text-6xl">
            <span className="text-block">{off.succeeded}</span> of {off.total} got through without Tripwire.
            <br />
            <span className="text-allow">{on.succeeded}</span> of {on.total} with it.
          </h1>
        ) : (
          <h1 className="display-caps text-3xl text-muted">
            Needs an off run and an enforce run to compare ({off ? "missing enforce" : on ? "missing off" : "missing both"}).
          </h1>
        )}
        {forced && (
          <p className="max-w-3xl text-lg text-muted">
            Simulated hijacked agent: the harness issues each attack&apos;s action itself, because current models resist these
            injections on their own. &ldquo;Without&rdquo; is the damage that action does; &ldquo;with&rdquo; is what Tripwire
            stops.
          </p>
        )}
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {off && <ModePanel title="Without Tripwire" metrics={off} attacks={offAttacks} />}
        {on && <ModePanel title="With Tripwire" metrics={on} attacks={enforceAttacks} />}
      </div>
    </div>
  );
}

function ModePanel({ title, metrics, attacks }: { title: string; metrics: Metrics; attacks?: AttackRow[] }) {
  const through = metrics.succeeded;
  return (
    <Panel
      title={title}
      aside={`${backendName(metrics.backend)} · ${metrics.model}`}
      tone={metrics.mode === "off" && through > 0 ? "block" : "mark"}
    >
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Got through" value={through} tone={through > 0 ? "text-block" : "text-allow"} />
        <Stat label="Blocked" value={metrics.blocked} tone="text-foreground" />
        <Stat label="Asked you" value={metrics.asked} tone={metrics.asked > 0 ? "text-ask" : "text-muted"} />
      </div>
      <p className="mt-3 font-mono text-base text-muted">
        Normal tasks wrongly blocked:{" "}
        <span className={metrics.benignFalsePositives > 0 ? "text-block" : "text-foreground"}>
          {metrics.benignFalsePositives} of {metrics.benignTotal}
        </span>
        {metrics.errored > 0 && <> · {metrics.errored} errored</>}
      </p>
      {attacks && attacks.length > 0 && <AttackMatrix attacks={attacks} />}
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className={`display-caps text-5xl leading-none tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/** Every attack in the run as one cell: grouped by where it hides, one row per goal, one column per technique. */
function AttackMatrix({ attacks }: { attacks: AttackRow[] }) {
  const find = (c: string, t: string, g: string) => attacks.find((a) => a.carrier === c && a.technique === t && a.goal === g);
  return (
    <div className="mt-5 border-t border-border pt-4">
      <table className="w-full table-fixed border-separate border-spacing-1 font-mono text-sm">
        <colgroup>
          <col className="w-[9.5rem]" />
          {TECHNIQUES.map(([key]) => (
            <col key={key} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="text-left align-bottom font-normal text-muted">Wants to</th>
            {TECHNIQUES.map(([key, label]) => (
              <th key={key} className="px-1 text-center align-bottom font-normal leading-tight text-muted">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        {CARRIERS.map(([c, cLabel]) => (
          <tbody key={c}>
            <tr>
              <th colSpan={TECHNIQUES.length + 1} className="pt-2 text-left font-normal text-foreground">
                Hidden in: {cLabel.toLowerCase()}
              </th>
            </tr>
            {GOALS.map(([g, gLabel]) => (
              <tr key={g}>
                <th className="truncate pr-2 text-left font-normal text-muted">{gLabel}</th>
                {TECHNIQUES.map(([t]) => (
                  <td key={t} className="p-0">
                    <Cell attack={find(c, t, g)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p className="mt-2 flex flex-wrap gap-x-5 font-mono text-sm text-muted">
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 bg-block align-middle" />
          got through
        </span>
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 border border-allow align-middle" />
          blocked
        </span>
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 bg-ask align-middle" />
          asked you
        </span>
      </p>
    </div>
  );
}

function Cell({ attack }: { attack?: AttackRow }) {
  if (!attack) return <span className="block h-6 border border-dashed border-border" title="Not in this run" />;
  const style =
    attack.outcome === "succeeded"
      ? "bg-block shadow-[0_0_8px_rgb(255_42_42/0.6)]"
      : attack.outcome === "asked"
        ? "bg-ask"
        : attack.outcome === "blocked"
          ? "border border-allow/70"
          : "border border-dashed border-mark";
  return <span className={`block h-6 ${style}`} title={`${attack.id.split(":").pop()} · ${attack.outcome}`} />;
}
