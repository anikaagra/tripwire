import { describe, expect, it } from "vitest";
import { extractEntities } from "./entities.js";

describe("extractEntities", () => {
  it("extracts an email", () => {
    const entities = extractEntities("contact attacker@evil.com for details");
    expect(entities).toEqual([
      { kind: "email", value: "attacker@evil.com", start: 8, end: 25 },
    ]);
  });

  it("extracts a dollar amount", () => {
    const entities = extractEntities("send $2,000 today");
    expect(entities.map((e) => e.kind)).toEqual(["amount"]);
    expect(entities[0]?.value).toBe("$2,000");
  });

  it("extracts an account-like digit run between 4 and 17 digits", () => {
    const entities = extractEntities("also send it to account 4417 right away");
    expect(entities).toEqual([{ kind: "account", value: "4417", start: 24, end: 28 }]);
  });

  it("ignores digit runs shorter than 4 or longer than 17", () => {
    const entities = extractEntities("item 12 costs 123456789012345678 units");
    expect(entities.filter((e) => e.kind === "account")).toEqual([]);
  });

  it("does not double-count a phone number's digits as an account", () => {
    const entities = extractEntities("call 555-123-4567 to confirm");
    expect(entities).toHaveLength(1);
    expect(entities[0]?.kind).toBe("phone");
  });

  it("extracts a URL without swallowing trailing punctuation", () => {
    const entities = extractEntities("see https://example.com/page for info.");
    expect(entities[0]).toMatchObject({ kind: "url", value: "https://example.com/page" });
  });

  it("extracts multiple entities in order", () => {
    const entities = extractEntities("Email bob@x.com and wire $500 to 99887766.");
    expect(entities.map((e) => e.kind)).toEqual(["email", "amount", "account"]);
  });
});