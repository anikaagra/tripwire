"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { formatClock, type RecordingSummary } from "@/lib/replay";
import { useRecordingList } from "@/lib/useReplay";
import { OfflineBadge } from "@/components/OfflineBadge";
import { Panel } from "@/components/Panel";

/** Recent recordings, newest first. Falls back to public/recordings/index.json offline. */
export default function ReplayListPage() {
  return (
    <Suspense fallback={<p className="display-caps text-xl text-muted">Loading…</p>}>
      <ReplayList />
    </Suspense>
  );
}

function ReplayList() {
  const forceFile = useSearchParams().get("source") === "file";
  const list = useRecordingList(forceFile);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-caps text-5xl">Replay</h1>
          <p className="mt-1 text-lg text-muted">Saved runs, played back with their original timing. The stage backup if a live run stalls.</p>
        </div>
        {list.status === "ready" && list.source === "file" && <OfflineBadge />}
      </div>

      {list.status === "loading" && <p className="display-caps text-xl text-muted">Loading tapes…</p>}
      {list.status === "error" && (
        <Panel>
          <h2 className="display-caps text-3xl">No tapes reachable</h2>
          <p className="mt-2 text-lg text-muted">
            Can&apos;t reach Convex and there are no offline copies ({list.message}). Export one with{" "}
            <code className="font-mono text-foreground">pnpm record --export &lt;id&gt;</code>.
          </p>
        </Panel>
      )}
      {list.status === "ready" && list.data.length === 0 && (
        <Panel>
          <h2 className="display-caps text-3xl">No recordings yet</h2>
          <p className="mt-2 text-lg text-muted">
            Save one with <code className="font-mono text-foreground">pnpm tail --record</code> during a run, or{" "}
            <code className="font-mono text-foreground">pnpm record</code> after it.
          </p>
        </Panel>
      )}
      {list.status === "ready" && list.data.length > 0 && (
        <Panel title="Tapes" aside={`${list.data.length} saved`} bodyClassName="">
          <ul className="divide-y divide-border">
            {list.data.map((r) => (
              <Row key={r.id} r={r} file={list.source === "file"} />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Row({ r, file }: { r: RecordingSummary; file: boolean }) {
  const href = (autoplay: boolean) => {
    const q = [file ? "source=file" : "", autoplay ? "autoplay=1" : ""].filter(Boolean).join("&");
    return `/replay/${encodeURIComponent(r.id)}${q ? `?${q}` : ""}`;
  };
  const armed = r.mode === "enforce";
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 hover:bg-panel-raised">
      <span
        className={`display-caps w-28 shrink-0 text-lg ${armed ? "text-block" : "text-muted"}`}
        title={r.mode ? `mode ${r.mode}` : undefined}
      >
        {armed ? "Armed" : r.mode === "monitor" ? "Watching" : r.mode === "off" ? "Disarmed" : "—"}
      </span>
      <span className="min-w-0 flex-1">
        <Link href={href(false)} className="block truncate font-mono text-lg text-foreground underline-offset-4 hover:underline">
          {r.id}
        </Link>
        <span className="block font-mono text-sm text-muted">
          {[r.scenario, r.backend === "nessie" ? "Nessie" : r.backend, `${r.eventCount} calls`, formatClock(r.durationMs)]
            .filter(Boolean)
            .join(" · ")}
          {" · "}
          {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          {r.truncated && <span className="text-ask"> · truncated</span>}
        </span>
      </span>
      <Link
        href={href(true)}
        className="display-caps flex h-11 items-center gap-2 border border-mark px-4 text-lg hover:border-foreground"
        aria-label={`Play ${r.id}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 2 L14 8 L3 14 Z" fill="currentColor" />
        </svg>
        Play
      </Link>
    </li>
  );
}
