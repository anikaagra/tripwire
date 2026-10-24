# pnpm tail and the run recorder

Live, colorized timeline of Tripwire tool calls from Convex: the team's UI until the dashboard exists.

```sh
pnpm tail                       # follow the latest session (switches when a new one starts)
pnpm tail --session <id>        # pin one session
pnpm tail --once                # print a snapshot and exit
pnpm tail --record [--id name]  # also save a replayable recording when the session ends or on Ctrl-C
pnpm record [--session <id>] [--id name]   # save a recording after the fact (final balance only)
```

Rows show time, `server__tool`, decision (ALLOW green, BLOCK red, ASK yellow), reason, latency, and the Nessie id, plus `taint×N` / `rule×N` markers. The header shows the session, mode, backend, scenario, intent, effective balance, and attacker-received. In a terminal it redraws full-screen with the header pinned; piped output is append-only. `--no-color` / `NO_COLOR` turn colors off.

Reads Convex `sessions.currentSession`, `events.eventsBySession`, `envState.byScenario`; writes `recordings.save`. The replay page reads `recordings.recordingById({ recordingId })` (and `recentRecordings` for a picker). A recording holds the session's events with original timing (`offsetMs`), a session snapshot, and, with `--record`, balance samples over time (`envStates`). At most 500 events.

Needs `CONVEX_URL` in the repo-root `.env.local`.
