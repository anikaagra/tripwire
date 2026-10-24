/**
 * Thin typed client for Capital One's Nessie API.
 * - https only; the key goes in as ?key= and is never logged (paths only).
 * - 5 s timeout per attempt, one retry on network errors, timeouts, and 5xx.
 * - Normalizes `id` / `_id` (POST returns _id, some GETs return id).
 * - list(): a 404 on a list endpoint means "empty" (GET /accounts/{id}/transfers does this).
 * - Logs per-call latency to stderr: `[nessie] POST /accounts/:id/withdrawals 201 112ms`.
 * See docs/nessie-findings.md for the live behavior this is built around.
 */

export interface NessieRecord {
  id: string;
  [k: string]: unknown;
}

export class NessieError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "NessieError";
  }
}

export interface NessieClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/** POST bodies wrap the record in objectCreated; GET bodies are the record. Always expose `id`. */
export function normalize(raw: unknown): NessieRecord {
  const o = (raw && typeof raw === "object" && "objectCreated" in raw ? (raw as any).objectCreated : raw) as any;
  if (!o || typeof o !== "object") throw new Error("Nessie returned a non-object");
  const id = o._id ?? o.id;
  if (typeof id !== "string") throw new Error("Nessie record has no id");
  const { _id, ...rest } = o;
  return { ...rest, id };
}

/** Strip ids from a path for logs, so log lines group by endpoint. */
export const logPath = (path: string) => path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id");

export class NessieClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: NessieClientOptions) {
    if (!opts.apiKey) throw new Error("NESSIE_API_KEY is not set (put it in .env.local).");
    this.base = (opts.baseUrl ?? "https://api.nessieisreal.com").replace(/\/+$/, "");
    if (!this.base.startsWith("https://")) throw new Error("NESSIE_BASE_URL must use https.");
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.fetchFn = opts.fetch ?? fetch;
    this.log = opts.log ?? ((l) => console.error(l));
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env, extra: Partial<NessieClientOptions> = {}) {
    return new NessieClient({ apiKey: env.NESSIE_API_KEY ?? "", baseUrl: env.NESSIE_BASE_URL, ...extra });
  }

  /** Raw request. Returns status + parsed body; throws NessieError only for network failures after the retry. */
  async request(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    const url = `${this.base}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(this.opts.apiKey)}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = performance.now();
      try {
        const res = await this.fetchFn(url, {
          method,
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const text = await res.text();
        const ms = performance.now() - t0;
        this.log(`[nessie] ${method} ${logPath(path)} ${res.status} ${ms.toFixed(0)}ms${attempt ? " (retry)" : ""}`);
        if (res.status >= 500 && attempt === 0) {
          lastErr = new NessieError(`Nessie ${res.status}`, res.status, logPath(path));
          continue;
        }
        let parsed: unknown = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          /* plain-text error bodies */
        }
        return { status: res.status, body: parsed };
      } catch (err) {
        const ms = performance.now() - t0;
        // Never include the URL (it carries the key) in logs or errors.
        const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network error";
        this.log(`[nessie] ${method} ${logPath(path)} ${reason} ${ms.toFixed(0)}ms${attempt ? " (retry)" : ""}`);
        lastErr = new NessieError(`Nessie ${reason}`, 0, logPath(path));
      }
    }
    throw lastErr instanceof NessieError ? lastErr : new NessieError("Nessie request failed", 0, logPath(path));
  }

  private async expect(method: string, path: string, ok: number[], body?: unknown) {
    const r = await this.request(method, path, body);
    if (!ok.includes(r.status)) {
      const detail = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
      throw new NessieError(`Nessie ${method} ${logPath(path)} -> ${r.status}: ${String(detail).slice(0, 200)}`, r.status, logPath(path));
    }
    return r.body;
  }

  async get(path: string): Promise<NessieRecord> {
    return normalize(await this.expect("GET", path, [200]));
  }

  /** GET a list; 404 means empty. */
  async list(path: string): Promise<NessieRecord[]> {
    const r = await this.request("GET", path);
    if (r.status === 404) return [];
    if (r.status !== 200 || !Array.isArray(r.body)) {
      throw new NessieError(`Nessie GET ${logPath(path)} -> ${r.status}`, r.status, logPath(path));
    }
    return r.body.map(normalize);
  }

  async create(path: string, body: unknown): Promise<NessieRecord> {
    return normalize(await this.expect("POST", path, [200, 201], body));
  }

  async update(path: string, body: unknown): Promise<void> {
    await this.expect("PUT", path, [200, 202], body);
  }

  /** true if deleted (or already gone); false if Nessie doesn't allow it. */
  async remove(path: string): Promise<boolean> {
    const r = await this.request("DELETE", path);
    return r.status < 300 || r.status === 404;
  }
}
