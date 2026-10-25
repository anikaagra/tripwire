import { describe, expect, it } from "vitest";
import { SpanStore } from "./spanStore.js";

describe("SpanStore", () => {
  it("gives spans from different sessions distinct ids", () => {
    // Regression (Anika A): two proxy processes each numbered spans
    // span_0, span_1, ... independent of session, so once several sessions
    // existed in the shared Convex deployment, spans.spanById's .unique()
    // lookup found duplicate ids and threw, crashing the event page.
    const store = new SpanStore();
    const a = store.addSpan({ sessionId: "session-a", server: "inbox", tool: "read_email", itemId: "e1", text: "hi" });
    const b = store.addSpan({ sessionId: "session-b", server: "inbox", tool: "read_email", itemId: "e1", text: "hi" });

    expect(a.id).not.toBe(b.id);
    expect(a.id).toContain("session-a");
    expect(b.id).toContain("session-b");
  });

  it("still scopes getSpansForSession correctly with the new id format", () => {
    const store = new SpanStore();
    store.addSpan({ sessionId: "s1", server: "inbox", tool: "read_email", itemId: "e1", text: "one" });
    store.addSpan({ sessionId: "s2", server: "inbox", tool: "read_email", itemId: "e1", text: "two" });
    store.addSpan({ sessionId: "s1", server: "inbox", tool: "read_email", itemId: "e2", text: "three" });

    expect(store.getSpansForSession("s1")).toHaveLength(2);
    expect(store.getSpansForSession("s2")).toHaveLength(1);
  });
});
