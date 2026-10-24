/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as approvals from "../approvals.js";
import type * as devSeed from "../devSeed.js";
import type * as envState from "../envState.js";
import type * as events from "../events.js";
import type * as recordings from "../recordings.js";
import type * as redteam from "../redteam.js";
import type * as sessions from "../sessions.js";
import type * as sharedTypesCheck from "../sharedTypesCheck.js";
import type * as spans from "../spans.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  approvals: typeof approvals;
  devSeed: typeof devSeed;
  envState: typeof envState;
  events: typeof events;
  recordings: typeof recordings;
  redteam: typeof redteam;
  sessions: typeof sessions;
  sharedTypesCheck: typeof sharedTypesCheck;
  spans: typeof spans;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
