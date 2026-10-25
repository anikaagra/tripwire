import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * The proxy's real tripwire.policy.yaml, so the firewall trace shows each
 * tool's class, risk tier, rules, and the trusted description the judge sees,
 * not a copy that could drift. Parsed with the same yaml library as
 * packages/policy's loader; the shape is passed through as written.
 */
export const dynamic = "force-dynamic";

const POLICY_PATH = resolve(process.cwd(), "../../tripwire.policy.yaml");

export function GET() {
  try {
    const doc = parse(readFileSync(POLICY_PATH, "utf8")) as { tools?: Record<string, unknown> };
    return Response.json({ tools: doc.tools ?? {} });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
