import type { Mode } from "@tripwire/shared";

export interface Session {
  id: string;
  mode: Mode;
  intent: string;
  scenario?: string;
  startedAt: number;
}

/**
 * In-memory session table. The harness registers intent once per session via
 * POST /sessions/:id/intent on the control API before it starts calling tools.
 * A session with no registered intent is assumed to have intent "" — rules
 * and taint still run, but the judge will almost always say "unclear".
 */
export class SessionStore {
  private sessions = new Map<string, Session>();

  create(id: string, mode: Mode, scenario?: string): Session {
    const session: Session = { id, mode, intent: "", scenario, startedAt: Date.now() };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getOrCreate(id: string, defaultMode: Mode): Session {
    return this.sessions.get(id) ?? this.create(id, defaultMode);
  }

  setIntent(id: string, intent: string, defaultMode: Mode): Session {
    const session = this.getOrCreate(id, defaultMode);
    session.intent = intent;
    return session;
  }
}
