"use client";

import { useEffect, useState } from "react";

/**
 * Context the dashboard reads from repo files rather than Convex: the policy
 * (app/api/policy) and a scenario's inbox seed (app/api/inbox). Each is fetched
 * once per page load and cached in memory.
 */

export interface ToolPolicyView {
  kind: "source" | "sink" | "neutral";
  risk?: "low" | "medium" | "high" | "critical";
  trustedDescription: string;
  rules?: {
    maxAmountCents?: number;
    recipientAllowlist?: string[];
    alwaysAsk?: boolean;
  };
}

export interface InboxEmail {
  id: string;
  from?: string;
  subject?: string;
}

const cache = new Map<string, Promise<unknown>>();

function load<T>(url: string, pick: (json: unknown) => T): Promise<T> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return cache.get(url)!.then(pick);
}

function useLoaded<T>(url: string | null, pick: (json: unknown) => T): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    if (!url) return;
    let live = true;
    load(url, pick).then((v) => live && setValue(v));
    return () => {
      live = false;
    };
    // pick is a module-level function at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return value;
}

const pickTools = (json: unknown) =>
  ((json as { tools?: Record<string, ToolPolicyView> } | null)?.tools ?? {}) as Record<string, ToolPolicyView>;

const pickEmails = (json: unknown) => {
  const list = (json as { emails?: InboxEmail[] } | null)?.emails ?? [];
  return new Map(list.map((e) => [e.id, e]));
};

/** Policy entries keyed by qualified tool name (e.g. "bank__transfer"). */
export function usePolicy(): Record<string, ToolPolicyView> | undefined {
  return useLoaded("/api/policy", pickTools);
}

/** The scenario's emails keyed by id; empty for scenarios without a seed file. */
export function useInbox(scenario: string | undefined): Map<string, InboxEmail> | undefined {
  return useLoaded(scenario ? `/api/inbox?scenario=${encodeURIComponent(scenario)}` : null, pickEmails);
}
