"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { formatClock, type RecordingSummary } from "@/lib/replay";
import { useRecordingList } from "@/lib/useReplay";
import { OfflineBadge } from "@/components/OfflineBadge";

/** Recent recordings, newest first. Falls back to public/recordings/index.json offline. */
export default function ReplayListPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <ReplayList />
    </Suspense>
  );
}

function ReplayList() {
  const forceFile = useSearchParams().get("source") === "file";
  const list = useRecordingList(forceFile);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Replay</h1>
        {list.status === "ready" && list.source === "file" && <OfflineBadge />}
      </div>

      {list.status === "loading" && <p className="text-muted">Loading recordings…</p>}
      {list.status === "error" && (
        <p className="text-muted">
          Can&apos;t reach Convex and there are no offline copies ({list.message}). Export one with{" "}
          <code className="font-mono">pnpm record --export &lt;id&gt;</code>.
        </p>
      )}
      {list.status === "ready" && list.data.length === 0 && (
        <p className="text-muted">
          No recordings yet. Save one with <code className="font-mono">pnpm tail --record</code> during a run, or{" "}
          <code className="font-mono">pnpm record</code> after it.
        </p>
      )}
      {list.status === "ready" && list.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Recording</th>
                <th className="px-3 py-3 font-semibold">Scenario</th>
                <th className="px-3 py-3 font-semibold">Mode</th>
                <th className="px-3 py-3 font-semibold">Backend</th>
                <th className="px-3 py-3 text-right font-semibold">Events</th>
                <th className="px-3 py-3 text-right font-semibold">Length</th>
                <th className="px-5 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.data.map((r) => (
                <Row key={r.id} r={r} file={list.source === "file"} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ r, file }: { r: RecordingSummary; file: boolean }) {
  const href = `/replay/${encodeURIComponent(r.id)}${file ? "?source=file" : ""}`;
  return (
    <tr className="hover:bg-background">
      <td className="px-5 py-3">
        <Link href={href} className="font-mono font-medium underline-offset-4 hover:underline">
          {r.id}
        </Link>
        {r.truncated && <span className="ml-2 text-xs text-ask">truncated</span>}
      </td>
      <td className="px-3 py-3">{r.scenario ?? "—"}</td>
      <td className="px-3 py-3">{r.mode ?? "—"}</td>
      <td className="px-3 py-3 capitalize">{r.backend ?? "—"}</td>
      <td className="px-3 py-3 text-right font-mono">{r.eventCount}</td>
      <td className="px-3 py-3 text-right font-mono">{formatClock(r.durationMs)}</td>
      <td className="px-5 py-3 text-sm text-muted">
        {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </td>
    </tr>
  );
}
