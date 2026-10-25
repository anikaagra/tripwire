"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";

/** Mobile-friendly single-approval page: one sentence, the request, approve/deny. */
export default function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const approval = useQuery(api.approvals.get, { approvalId: id });
  const event = useQuery(api.events.eventById, approval ? { eventId: approval.eventId } : "skip");
  const decide = useMutation(api.approvals.decide);
  const [submitting, setSubmitting] = useState<"approved" | "denied" | null>(null);

  if (approval === undefined) return <p className="text-muted">Loading…</p>;
  if (approval === null) return <p className="text-muted">No approval with that id.</p>;

  async function respond(status: "approved" | "denied") {
    setSubmitting(status);
    try {
      await decide({ approvalId: id, status });
    } finally {
      setSubmitting(null);
    }
  }

  const decided = approval.status !== "pending";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="rounded-lg border border-ask bg-ask-bg p-5 text-ask">
        <div className="text-xs uppercase tracking-wide">Tripwire is asking</div>
        <p className="mt-1 text-lg font-semibold">{event?.reason ?? "Loading the request…"}</p>
      </div>

      {event && (
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-wide text-muted">Request</div>
          <div className="mt-1 text-lg font-medium">
            {event.server}__{event.tool}
          </div>
          <pre className="mt-3 overflow-x-auto rounded bg-background p-3 text-sm">
            {JSON.stringify(event.args, null, 2)}
          </pre>
        </div>
      )}

      {decided ? (
        <p className="text-center text-lg font-semibold capitalize">Already {approval.status}.</p>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => respond("denied")}
            disabled={submitting !== null}
            className="flex-1 rounded-lg border border-block bg-block-bg py-4 text-lg font-bold text-block disabled:opacity-50"
          >
            {submitting === "denied" ? "Denying…" : "Deny"}
          </button>
          <button
            onClick={() => respond("approved")}
            disabled={submitting !== null}
            className="flex-1 rounded-lg border border-allow bg-allow-bg py-4 text-lg font-bold text-allow disabled:opacity-50"
          >
            {submitting === "approved" ? "Approving…" : "Approve"}
          </button>
        </div>
      )}
    </div>
  );
}
