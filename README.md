# tripwire
Cal Hacks 2026

## Drop-in proof

Tripwire is a proxy, not a modified agent — any MCP client can point at it
with nothing but config. Two ways to see that live:

**Claude Code** — this repo's `.mcp.json` already defines it. Open this
project in Claude Code, approve the `tripwire` server when prompted, and
`inbox__*`/`bank__*` tools (renamed `<server>__<tool>`) show up alongside
your other tools. It uses `${CLAUDE_PROJECT_DIR}`, so it works for every
teammate's checkout with no edits. Because Claude Code doesn't register an
intent the way `apps/agent`'s harness does, every session starts with intent
`""` — set one yourself so the guard has something to judge against:
```
curl -X POST http://localhost:8787/sessions/claude-code/intent \
  -H 'content-type: application/json' \
  -d '{"text": "Summarize my unread emails and pay the electricity bill."}'
```
(`claude-code` is the fixed session id `.mcp.json` sets via `TRIPWIRE_SESSION_ID`,
so you always know what to curl — it isn't a secret or anything sensitive.)

**Claude Desktop** — run `pnpm tripwire:desktop-config`, paste the printed
`mcpServers` entry into `~/Library/Application Support/Claude/claude_desktop_config.json`,
restart Desktop. It bakes in this machine's absolute paths since Desktop's
config isn't scoped to a project the way `.mcp.json` is, so regenerate it
if you move the checkout.

Either way, the proxy loads `ANTHROPIC_API_KEY`/`CONVEX_URL`/`NESSIE_API_KEY`
straight from this repo's `.env`/`.env.local` — no secrets belong in either
client's config.

## Convex for teammates

We all use **one** Convex deployment: Asmi's `tripwire` project.

- **Deployment URL:** put the shared `CONVEX_URL` (ask Asmi) in your `.env.local`. Clients (proxy, dashboard, `pnpm tail`) read and write through it.
- **Deploy key:** if you need to push functions yourself, Asmi will share a deploy key **privately** (DM only). Never commit it or paste it in a channel. Step-by-step setup, the exact deploy command, and pitfalls: [`docs/convex-team.md`](docs/convex-team.md).
- **Always `git pull` on `main` before `npx convex dev`.** `convex dev` pushes your whole local `convex/` folder, so stale files would delete or overwrite other people's functions on the shared deployment.
- Add your queries and mutations in your own file under `convex/` (see the list at the top of `convex/schema.ts`). Schema changes go through Asmi.
- Dev data: `pnpm seed:dev` inserts a fake session and events; `pnpm seed:clear` removes them.

## Built on Capital One Nessie

Tripwire's bank runs on real Nessie records. Every payment the agent makes, and every attack it falls for when Tripwire is off, is a real Nessie withdrawal and deposit. The attacker's account visibly receives the stolen $2,000.

**Endpoints used:** `POST /customers`, `POST /customers/{id}/accounts`, `GET /accounts/{id}`, `POST`/`GET /accounts/{id}/withdrawals`, `POST`/`GET /accounts/{id}/deposits`, `DELETE /deposits/{id}`, `POST`/`GET /accounts/{id}/bills`, `GET`/`PUT`/`DELETE /bills/{id}`.

**How it works:** Nessie never moves an account's balance and transfers can't name a payee, so we verified this with `pnpm nessie:verify` and built a ledger. Each payment is a withdrawal from the user plus a deposit to the payee, tagged with the run and session. The balance is computed from this run's records, so a reset restores $3,200 instantly. One attack hides inside a real Nessie bill's payee field: the injection arrives through the banking API itself. Average 116 ms per Nessie call; every bank tool answers in under 1 s. Details: [`docs/nessie-findings.md`](docs/nessie-findings.md), [`apps/mock-servers/bank/README.md`](apps/mock-servers/bank/README.md).

**Run it:**
```sh
pnpm nessie:verify                         # probe live Nessie behavior (docs/nessie-findings.md)
pnpm nessie:seed                           # create or reuse the user, Bay Electric, attacker 4417, and the bills
BANK_BACKEND=nessie pnpm bank:control      # POST /reset?scenario=bill-pay before each demo
pnpm redteam --backend nessie --concurrency 1 --limit 5   # live on-stage attacks
```
Switch backends with `BANK_BACKEND=nessie|local`. The tools behave identically on both, and `local` is the offline fallback.
