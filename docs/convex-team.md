# Deploying Convex functions as a teammate

We all share **one** Convex dev deployment: `doting-armadillo-881` (project `tripwire`, URL `https://doting-armadillo-881.convex.cloud`). Asmi owns it. You can push your `convex/` functions to it without Asmi's login by using a **deploy key**.

> A deploy key is an admin credential for the deployment. Never commit it, never paste it in a channel, never put it in a file that git tracks. Keep it in your own `.env.local` (git-ignored).

## Asmi: create a key for each teammate (once)

One key per person, so any key can be revoked without affecting the others.

**Dashboard:**
1. Open https://dashboard.convex.dev and select the **tripwire** project.
2. In the deployment picker, choose the **dev deployment `doting-armadillo-881`** (Asmi's dev deployment), not production.
3. Go to **Settings → URL & Deploy Key**.
4. Click **Generate Development Deploy Key** (the button label may differ slightly between dashboard versions). Name it after the teammate, e.g. `anika-g`.
5. Copy the key once and send it to that teammate in a **private DM**. Don't keep a copy anywhere else.

**CLI alternative** (prints the key to your terminal, so don't run it while screen-sharing):
```sh
npx convex deployment token create anika-g --deployment doting-armadillo-881
```

**Revoking a key:** delete it in the same dashboard page, or run `npx convex deployment token delete anika-g`.

## Teammate: one-time setup

1. Put the key in your repo-root `.env.local`:
   ```sh
   CONVEX_DEPLOY_KEY=<the key Asmi DMed you>
   CONVEX_URL=https://doting-armadillo-881.convex.cloud
   ```
2. **Remove any `CONVEX_DEPLOYMENT=` line** from your `.env.local`. If it's set, `convex deploy` targets the project's *production* deployment instead of ours, and `convex dev` may push to your own personal dev deployment.
3. Don't run `npx convex dev` interactively or log in; the key is all you need.

## Teammate: every deploy

```sh
git checkout main
git pull origin main                 # ALWAYS first: see the rule below
# merge your branch, or make sure every file in convex/ is the latest from main
pnpm install --frozen-lockfile
pnpm convex:typecheck                # schema + drift guard must pass
npx convex dev --once                # push once to the deployment the key points at, then exit
```

Check the output names the right deployment before trusting the push:

```
Developing against deployment ... doting-armadillo-881 ...
✔ Convex functions ready!
```

If it names any other deployment, stop (Ctrl-C) and fix your `.env.local`.

## The rule: pull main first, every time

A deploy pushes your **entire local `convex/` folder** and makes the deployment match it exactly:

- A function that isn't in your local `convex/` gets **removed** from the deployment, even if a teammate deployed it an hour ago.
- An older copy of someone's file **overwrites** their newer version.
- Your local `schema.ts` replaces the deployed schema. If it's stale, the deploy can fail, or drop indexes other people rely on.

So deploy only from an up-to-date `main` (plus your own changes), never from an old branch. If you're unsure, run `git status` and `git log origin/main..HEAD` first.

## Who owns what in convex/

- `schema.ts`, `envState.ts`, `devSeed.ts`, `sharedTypesCheck.ts`, `recordings.ts` (soon): Asmi
- `sessions.ts`, `events.ts`, `spans.ts`, `approvals.ts`: Anika G
- `redteam.ts`: Anika A

`schema.ts` changes go through a quick huddle. `packages/shared/src/types.ts` is the source of truth, and `pnpm convex:typecheck` fails if the schema drifts from it.
