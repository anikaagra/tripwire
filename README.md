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
- **Deploy key:** if you need to push functions yourself, Asmi will share a deploy key **privately** (DM only). Never commit it or paste it in a channel. Put it in `.env.local` as `CONVEX_DEPLOY_KEY`.
- **Always `git pull` on `main` before `npx convex dev`.** `convex dev` pushes your whole local `convex/` folder, so stale files would delete or overwrite other people's functions on the shared deployment.
- Add your queries and mutations in your own file under `convex/` (see the list at the top of `convex/schema.ts`). Schema changes go through Asmi.
- Dev data: `pnpm seed:dev` inserts a fake session and events; `pnpm seed:clear` removes them.
