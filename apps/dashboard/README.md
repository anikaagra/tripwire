# Tripwire dashboard

Next.js (App Router) + Tailwind, backed by Convex. Every page is a client component on live Convex queries, so it updates as the proxy writes events.

## Run it

```bash
# once: the dashboard reads its own env file (same value as CONVEX_URL in the repo-root .env.local)
echo "NEXT_PUBLIC_CONVEX_URL=<your CONVEX_URL>" > apps/dashboard/.env.local

pnpm --filter @tripwire/dashboard dev      # http://localhost:3000
pnpm --filter @tripwire/dashboard build    # production build (next build)
pnpm --filter @tripwire/dashboard typecheck
pnpm --filter @tripwire/dashboard lint
```

`.env*` files are git-ignored. `NEXT_PUBLIC_*` values are baked in at build time, so rebuild after changing it.

## Pages

| Page | Shows | Reads (Convex) |
|---|---|---|
| `/` | Live session: timeline of allow / block / ask decisions, mode, balance, backend, intent, pending approvals | `sessions.currentSession`, `events.eventsBySession`, `envState.byScenario`, `approvals.pendingApprovals` |
| `/event/[id]` | One decision: what you asked for, the call, the reason, rule and taint hits, the injected sentence highlighted in its source, Nessie proof | `events.eventById`, `spans.spanById` |
| `/approve/[id]` | Phone approval: the reason, the proposed call, Approve / Deny | `approvals.get`, `events.eventById`, `approvals.decide` |
| `/redteam` | Red Team scorecard: off vs. enforce, blocked, asked, false positives, backend | `redteam.recentRuns` |
| `/replay` | Recent recordings, newest first | `recordings.recentRecordings` |
| `/replay/[id]` | Plays a recorded run with its original timing | `recordings.recordingById` |

## Replay (stage backup)

If the live run stalls on stage, open `/replay/<id>?autoplay=1`. Controls: play/pause, restart, 1x/2x/4x, scrubber; keys: space = play/pause, `r` = restart. Click a row for its details.

Recordings come from `pnpm tail --record` (during a run) or `pnpm record` (after it). For venue Wi-Fi, `pnpm record --export <id>` writes `public/recordings/<id>.json` (and `index.json`). `/replay` uses that file when Convex doesn't answer within ~3 s, or always with `?source=file`, and shows an "Offline copy" badge. Commit exported files so they're on the demo laptop. The export refuses to write if it finds a key, deploy key, Convex URL, or deployment name.

## Code layout

- `app/`: one folder per route; `ConvexClientProvider.tsx` wraps the app.
- `components/`: `DecisionChip` (the allow/block/ask pill, `size="lg"` for big views), `Explanation` (highlighted injected sentence + hidden-text label), `Nav`, `OfflineBadge`.
- `lib/format.ts`: money (cents to `$3,200.00`) and time helpers. `lib/replay.ts` / `lib/useReplay.ts`: replay logic and hooks (`lib/replay.test.ts` runs in the root `pnpm test`).
- Colors are tokens in `app/globals.css` (`allow`, `block`, `ask`, plus their `-bg` variants) with a dark-mode set; use them, not raw colors, so red/green stay readable from the back row.
- Convex's generated API is imported as `@convex/_generated/api` (path alias to the repo-root `convex/`).
