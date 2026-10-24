/**
 * Recordings: replayable demo runs. Owner: Asmi.
 *
 * Written by apps/tail (`pnpm record`, `pnpm tail --record`), read by the
 * dashboard's /replay/:runId page.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { recording } from "./schema";

export const MAX_RECORDING_EVENTS = 500;

/** Insert or replace a recording by its `id`. */
export const save = mutation({
  args: recording,
  handler: async (ctx, rec) => {
    if (rec.events.length > MAX_RECORDING_EVENTS) {
      throw new Error(`A recording holds at most ${MAX_RECORDING_EVENTS} events (got ${rec.events.length}).`);
    }
    for (const e of rec.events) {
      if (!Number.isFinite(e.offsetMs) || e.offsetMs < 0) throw new Error(`Bad offsetMs ${e.offsetMs} for event ${e.event.id}`);
    }
    const existing = await ctx.db
      .query("recordings")
      .withIndex("by_record_id", (q) => q.eq("id", rec.id))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, rec);
      return existing._id;
    }
    return await ctx.db.insert("recordings", rec);
  },
});

export const recordingById = query({
  args: { recordingId: v.string() },
  handler: async (ctx, { recordingId }) => {
    return await ctx.db
      .query("recordings")
      .withIndex("by_record_id", (q) => q.eq("id", recordingId))
      .unique();
  },
});

/** Newest first, without the event payloads (for a replay picker). */
export const recentRecordings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("recordings")
      .withIndex("by_createdAt")
      .order("desc")
      .take(Math.min(Math.max(1, limit ?? 20), 100));
    return rows.map((r) => ({
      id: r.id,
      runId: r.runId,
      sessionId: r.sessionId,
      createdAt: r.createdAt,
      intent: r.intent,
      mode: r.mode,
      backend: r.backend,
      eventCount: r.events.length,
      durationMs: r.events.length ? r.events[r.events.length - 1]!.offsetMs : 0,
      truncated: r.truncated ?? false,
    }));
  },
});
