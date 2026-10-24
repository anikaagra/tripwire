# tripwire
Cal Hacks 2026

## Convex for teammates

We all use **one** Convex deployment: Asmi's `tripwire` project.

- **Deployment URL:** put the shared `CONVEX_URL` (ask Asmi) in your `.env.local`. Clients (proxy, dashboard, `pnpm tail`) read and write through it.
- **Deploy key:** if you need to push functions yourself, Asmi will share a deploy key **privately** (DM only). Never commit it or paste it in a channel. Put it in `.env.local` as `CONVEX_DEPLOY_KEY`.
- **Always `git pull` on `main` before `npx convex dev`.** `convex dev` pushes your whole local `convex/` folder, so stale files would delete or overwrite other people's functions on the shared deployment.
- Add your queries and mutations in your own file under `convex/` (see the list at the top of `convex/schema.ts`). Schema changes go through Asmi.
- Dev data: `pnpm seed:dev` inserts a fake session and events; `pnpm seed:clear` removes them.
