# pnpm tail and the run recorder

Live, colorized timeline of Tripwire tool calls from Convex: the team's UI until the dashboard exists.

```sh
pnpm tail                       # follow the latest session (switches when a new one starts)
pnpm tail --session <id>        # pin one session
pnpm tail --once                # print a snapshot and exit
pnpm tail --record [--id name]  # also save a replayable recording when the session ends or on Ctrl-C
pnpm record [--session <id>] [--id name]   # save a recording after the fact (final balance only)
pnpm record --export [<recording id>]      # write it to apps/dashboard/public/recordings/ (offline backup; default: newest)
```

Rows show time, `server__tool`, decision (ALLOW green, BLOCK red, ASK yellow), reason, latency, and the Nessie id, plus `taint×N` / `rule×N` markers. The header shows the session, mode, backend, scenario, intent, effective balance, and attacker-received. In a terminal it redraws full-screen with the header pinned; piped output is append-only. `--no-color` / `NO_COLOR` turn colors off.

Reads Convex `sessions.currentSession`, `events.eventsBySession`, `envState.byScenario`; writes `recordings.save`. The replay page reads `recordings.recordingById({ recordingId })` (and `recentRecordings` for a picker). A recording holds the session's events with original timing (`offsetMs`), a session snapshot, and, with `--record`, balance samples over time (`envStates`). At most 500 events.

Needs `CONVEX_URL` in the repo-root `.env.local`.

## Replay on stage (dashboard `/replay`)

If the live run stalls, open `/replay/<id>?autoplay=1`: it plays the saved run with its original timing (space = play/pause, `r` = restart, 1x/2x/4x, scrubber). It loads from Convex; if Convex doesn't answer within ~3 s, or with `?source=file`, it loads the exported copy from `apps/dashboard/public/recordings/<id>.json` and shows an "offline copy" badge.

Before the demo, export the backup and commit it so it's on the demo laptop:

```sh
pnpm record --export <id>    # refuses to write if it finds a key, deploy key, Convex URL, or deployment name
```
