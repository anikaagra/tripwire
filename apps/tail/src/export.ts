/**
 * `pnpm record --export <id>`: writes a recording to
 * apps/dashboard/public/recordings/<id>.json, the dashboard's offline backup
 * for venue Wi-Fi, and keeps index.json there in sync for the /replay list.
 *
 * Exported files are committed and served publicly, so the export refuses to
 * write if it finds anything secret-looking. It names what it found, never the value.
 */
import type { Recording } from "./recording.js";

export const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/;

/** Recording without Convex's own fields, key order as stored. */
export function toExport(doc: Recording & { _id?: unknown; _creationTime?: unknown }): Recording {
  const { _id, _creationTime, ...rec } = doc;
  void _id;
  void _creationTime;
  return rec;
}

export interface IndexEntry {
  id: string;
  createdAt: number;
  intent?: string;
  mode?: string;
  scenario?: string;
  backend?: string;
  eventCount: number;
  durationMs: number;
  truncated?: boolean;
}

/** Same fields as recordings:recentRecordings, so /replay reads either source. */
export function indexEntry(rec: Recording): IndexEntry {
  return {
    id: rec.id,
    createdAt: rec.createdAt,
    intent: rec.intent,
    mode: rec.mode,
    scenario: rec.scenario,
    backend: rec.backend,
    eventCount: rec.events.length,
    durationMs: rec.events.length ? rec.events[rec.events.length - 1]!.offsetMs : 0,
    truncated: rec.truncated ?? false,
  };
}

/** Replace or add `entry`, newest first. */
export function upsertIndex(index: IndexEntry[], entry: IndexEntry): IndexEntry[] {
  return [entry, ...index.filter((e) => e.id !== entry.id)].sort((a, b) => b.createdAt - a.createdAt);
}

const SECRET_ENV = ["NESSIE_API_KEY", "ANTHROPIC_API_KEY", "CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT", "CONVEX_URL", "CONVEX_SITE_URL", "NEXT_PUBLIC_CONVEX_URL"];

const PATTERNS: [string, RegExp][] = [
  ["an Anthropic API key", /sk-ant-[A-Za-z0-9_-]{8,}/],
  ["a Convex deploy key", /\b(?:dev|prod|preview|project):[a-z0-9-]+\|/],
  ["a Convex URL", /[a-z0-9-]+\.convex\.(?:cloud|site)/i],
  ["a 32-hex key (Nessie-style)", /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/i],
];

/**
 * Returns a description of each secret-looking thing in `text` (empty = clean).
 * Checks the real values of our secret env vars (and the Convex deployment
 * name inside them), plus key-shaped patterns.
 */
export function findSecrets(text: string, env: Record<string, string | undefined> = process.env): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const name of SECRET_ENV) {
    const value = env[name]?.trim();
    if (!value) continue;
    const needles = new Set([value]);
    // The deployment name: "dev:doting-armadillo-881" or https://doting-armadillo-881.convex.cloud
    const deployment = value.replace(/^https?:\/\//, "").replace(/^[a-z]+:/, "").split("|")[0]!.split(".")[0]!;
    if (deployment.length >= 6) needles.add(deployment);
    for (const n of needles) {
      if (n.length >= 6 && lower.includes(n.toLowerCase())) {
        found.push(n === value ? `the value of ${name}` : "the Convex deployment name");
        break;
      }
    }
  }
  for (const [what, re] of PATTERNS) if (re.test(text)) found.push(what);
  return [...new Set(found)];
}
