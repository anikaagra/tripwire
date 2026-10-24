import { createServer, type Server as HttpServer } from "node:http";
import type { Mode } from "@tripwire/shared";
import type { SessionStore } from "./sessions.js";

/**
 * Minimal side-channel HTTP API — not the MCP transport. Lets the harness
 * register the user's intent before (or while) it drives the agent, per the
 * design doc's "harness registers intent with POST /sessions/:id/intent".
 */
export function startControlApi(
  port: number,
  sessions: SessionStore,
  defaultMode: Mode,
  onIntentSet?: (sessionId: string, intent: string) => void
): HttpServer {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && parts[0] === "health") {
      respond(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "intent" && parts[1]) {
      readJsonBody(req)
        .then((body) => {
          const text = typeof body.text === "string" ? body.text : "";
          const session = sessions.setIntent(parts[1]!, text, defaultMode);
          onIntentSet?.(parts[1]!, text);
          respond(res, 200, session);
        })
        .catch((err: Error) => respond(res, 400, { error: err.message }));
      return;
    }

    if (req.method === "GET" && parts[0] === "sessions" && parts[1] && parts.length === 2) {
      const session = sessions.get(parts[1]);
      respond(res, session ? 200 : 404, session ?? { error: "not found" });
      return;
    }

    respond(res, 404, { error: "not found" });
  });

  server.listen(port);
  return server;
}

function readJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, rejectPromise) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolvePromise(raw ? JSON.parse(raw) : {});
      } catch {
        rejectPromise(new Error("Invalid JSON body"));
      }
    });
    req.on("error", rejectPromise);
  });
}

function respond(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}