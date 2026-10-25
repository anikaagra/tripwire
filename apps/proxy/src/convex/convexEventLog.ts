import { makeFunctionReference } from "convex/server";
import type { ConvexHttpClient } from "convex/browser";
import type { ToolCallEvent } from "@tripwire/shared";
import type { EventLog } from "../eventLog.js";

const recordEvent = makeFunctionReference<"mutation">("events:record");
const setNessieIdFn = makeFunctionReference<"mutation">("events:setNessieId");

/**
 * Writes events to the shared Convex deployment (convex/events.ts). Never
 * lets a Convex outage break the demo: failures are logged to stderr, not
 * thrown, since EventLog.record() runs on every tool call.
 */
export class ConvexEventLog implements EventLog {
  constructor(private readonly client: ConvexHttpClient) {}

  async record(event: ToolCallEvent): Promise<void> {
    try {
      await this.client.mutation(recordEvent, event);
    } catch (err) {
      console.error(`[tripwire] Convex event write failed: ${(err as Error).message}`);
    }
  }

  async setNessieId(eventId: string, nessieId: string): Promise<void> {
    try {
      await this.client.mutation(setNessieIdFn, { id: eventId, nessieId });
    } catch (err) {
      console.error(`[tripwire] Convex nessieId patch failed: ${(err as Error).message}`);
    }
  }
}
