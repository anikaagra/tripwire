#!/usr/bin/env tsx
/** pnpm tripwire:approve [approval-id] — flips a pending approval to approved; the waiting proxy picks it up within one poll tick. */
import { decideFromCli } from "./decideApproval.js";

await decideFromCli("approved", "tripwire:approve");
