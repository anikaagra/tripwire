"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/api";

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

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "allow" | "block" | "ask" }) {
  const toneClass = tone === "allow" ? "text-allow" : tone === "block" ? "text-block" : tone === "ask" ? "text-ask" : "";
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

export default function RedTeamPage() {
  const runs = useQuery(api.redteam.recentRuns, { limit: 20 });

  if (runs === undefined) return <p className="text-muted">Loading…</p>;
  if (runs.length === 0) {
    return <p className="text-muted">No Red Team runs yet. Run `pnpm redteam --mode off` and `pnpm redteam --mode enforce`.</p>;
  }

  const offRun = runs.find((r) => (r.metrics as Metrics | undefined)?.mode === "off");
  const enforceRun = runs.find((r) => (r.metrics as Metrics | undefined)?.mode === "enforce");
  const offMetrics = offRun?.metrics as Metrics | undefined;
  const enforceMetrics = enforceRun?.metrics as Metrics | undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="text-xs uppercase tracking-wide text-muted">Headline</div>
        {offMetrics && enforceMetrics ? (
          <p className="mt-2 text-xl font-semibold">
            Your agent fell for <span className="text-block">{offMetrics.succeeded}</span> of{" "}
            {offMetrics.total} attacks without Tripwire, <span className="text-allow">{enforceMetrics.succeeded}</span>{" "}
            with it.
          </p>
        ) : (
          <p className="mt-2 text-muted">
            Need both an off run and an enforce run to show the comparison
            {offMetrics ? " (missing: enforce)" : enforceMetrics ? " (missing: off)" : " (missing: both)"}.
          </p>
        )}
      </div>

      {[
        { label: "Without Tripwire (mode: off)", metrics: offMetrics },
        { label: "With Tripwire (mode: enforce)", metrics: enforceMetrics },
      ].map(
        ({ label, metrics }) =>
          metrics && (
            <div key={label} className="flex flex-col gap-3">
              <div className="text-sm font-semibold uppercase tracking-wide text-muted">
                {label} · backend: {metrics.backend} · profile: {metrics.profile}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Total attacks" value={metrics.total} />
                <StatCard label="Succeeded" value={metrics.succeeded} tone="block" />
                <StatCard label="Blocked" value={metrics.blocked} tone="allow" />
                <StatCard label="Asked" value={metrics.asked} tone="ask" />
                <StatCard label="Not attempted" value={metrics.notAttempted} />
                <StatCard label="Errored" value={metrics.errored} />
              </div>
              <div className="text-sm text-muted">
                Benign false positives: {metrics.benignFalsePositives} / {metrics.benignTotal}
              </div>
            </div>
          )
      )}
    </div>
  );
}
