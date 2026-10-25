#!/usr/bin/env tsx
/** pnpm tripwire:deny [approval-id] — flips a pending approval to denied. */
import { decideFromCli } from "./decideApproval.js";

await decideFromCli("denied", "tripwire:deny");
