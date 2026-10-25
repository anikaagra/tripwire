import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sender and subject for each email id in a scenario's inbox seed
 * (scenarios/<scenario>.json, the same file the inbox server serves), so the
 * log can say which email the agent read instead of "e2".
 */
export const dynamic = "force-dynamic";

const SCENARIOS_DIR = resolve(process.cwd(), "../../scenarios");

interface SeedEmail {
  id: string;
  from?: string;
  subject?: string;
}

export function GET(request: Request) {
  const scenario = new URL(request.url).searchParams.get("scenario") ?? "";
  // Scenario names are plain slugs; anything else could walk out of scenarios/.
  if (!/^[a-z0-9-]+$/.test(scenario)) return Response.json({ emails: [] });
  try {
    const seed = JSON.parse(readFileSync(resolve(SCENARIOS_DIR, `${scenario}.json`), "utf8")) as { emails?: SeedEmail[] };
    const emails = (seed.emails ?? []).map(({ id, from, subject }) => ({ id, from, subject }));
    return Response.json({ emails });
  } catch {
    return Response.json({ emails: [] });
  }
}
