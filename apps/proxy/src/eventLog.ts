import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolCallEvent } from "@tripwire/shared";

/**
 * Where proxy events go. Convex is the real destination (so the dashboard
 * and pnpm tail can read it live); this interface lets a Convex-writing
 * implementation (Asmi's lane, which owns convex/schema.ts) slot in without
 * pipeline.ts changing. JsonlEventLog below is the local stand-in: it's also
 * exactly what pnpm tail can `tail -f` before that integration lands.
 */
export interface EventLog {
  record(event: ToolCallEvent): Promise<void>;
  /** Patches an already-recorded event's nessieId once the upstream result reveals it (the decision and its logging happen before the tool call runs). */
  setNessieId(eventId: string, nessieId: string): Promise<void>;
}

export class JsonlEventLog implements EventLog {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  async record(event: ToolCallEvent): Promise<void> {
    appendFileSync(this.filePath, JSON.stringify(event) + "\n");
  }

  async setNessieId(eventId: string, nessieId: string): Promise<void> {
    appendFileSync(this.filePath, JSON.stringify({ patch: eventId, nessieId }) + "\n");
  }
}

export class ConsoleEventLog implements EventLog {
  async record(event: ToolCallEvent): Promise<void> {
    const tag = event.decision.toUpperCase();
    console.error(`[tripwire] ${tag} ${event.server}__${event.tool} — ${event.reason}`);
  }

  async setNessieId(eventId: string, nessieId: string): Promise<void> {
    console.error(`[tripwire] Nessie confirmation ${nessieId} for ${eventId}`);
  }
}

export class MultiEventLog implements EventLog {
  constructor(private readonly logs: EventLog[]) {}
  async record(event: ToolCallEvent): Promise<void> {
    await Promise.all(this.logs.map((l) => l.record(event)));
  }
  async setNessieId(eventId: string, nessieId: string): Promise<void> {
    await Promise.all(this.logs.map((l) => l.setNessieId(eventId, nessieId)));
  }
}

export function ensureDataDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}
