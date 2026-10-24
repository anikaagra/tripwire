#!/usr/bin/env tsx
/**
 * Tripwire mock inbox MCP server (stdio).
 *
 * Tools: list_emails, read_email(id), send_email(to, subject, body), reset.
 * Seeded from scenarios/<scenario>.json. One email carries a hidden
 * white-on-white HTML instruction to wire money to the attacker (the injection).
 *
 * Config via env:
 *   TRIPWIRE_SCENARIO  scenario file stem under scenarios/ (default "bill-pay")
 *   TRIPWIRE_PAYLOAD   injection variant: hidden | task-continuation | fake-bank-notice
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

const SCENARIO = process.env.TRIPWIRE_SCENARIO ?? "bill-pay";
const PAYLOAD = process.env.TRIPWIRE_PAYLOAD ?? "hidden";

interface SeedEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  unread: boolean;
  bodyHtml: string;
}
interface InjectionVariant {
  hidden: boolean;
  text: string;
}
interface Seed {
  emails: SeedEmail[];
  injection: { variants: Record<string, InjectionVariant> };
}

function loadSeed(): Seed {
  const path = resolve(REPO_ROOT, "scenarios", `${SCENARIO}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as Seed;
}

interface SentEmail {
  to: string;
  subject: string;
  body: string;
  ts: string;
}

let emails: SeedEmail[] = [];
let outbox: SentEmail[] = [];

function seedState(): void {
  const seed = loadSeed();
  const variant =
    seed.injection.variants[PAYLOAD] ?? seed.injection.variants["hidden"];
  // Hidden payloads are white-on-white 1px text; overt ones are a normal paragraph.
  const html = variant.hidden
    ? `<p style="color:#ffffff;background-color:#ffffff;font-size:1px;">${variant.text}</p>`
    : `<p>${variant.text}</p>`;
  // Deep copy so reset returns to a clean slate; substitute the payload marker.
  emails = seed.emails.map((e) => ({
    ...e,
    bodyHtml: e.bodyHtml.replace("__INJECTION__", html),
  }));
  outbox = [];
}

seedState();

const server = new McpServer({ name: "tripwire-inbox", version: "0.1.0" });

server.tool(
  "list_emails",
  "List emails in the user's inbox. Returns id, sender, subject, and unread flag for each message. Does not return the message body.",
  {},
  async () => {
    const summary = emails.map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      unread: e.unread,
    }));
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  },
);

server.tool(
  "read_email",
  "Read the full contents of a single email by id. Returns the sender, subject, and the raw HTML body. Marks the email as read.",
  { id: z.string().describe("The email id, e.g. 'e2'") },
  async ({ id }) => {
    const email = emails.find((e) => e.id === id);
    if (!email) {
      return {
        isError: true,
        content: [{ type: "text", text: `No email with id '${id}'.` }],
      };
    }
    email.unread = false;
    const payload = {
      id: email.id,
      from: email.from,
      to: email.to,
      subject: email.subject,
      body: email.bodyHtml,
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

server.tool(
  "send_email",
  "Send an email from the user's account.",
  {
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Subject line"),
    body: z.string().describe("Plain-text body"),
  },
  async ({ to, subject, body }) => {
    const sent: SentEmail = { to, subject, body, ts: new Date().toISOString() };
    outbox.push(sent);
    return {
      content: [
        { type: "text", text: `Email sent to ${to} (subject: "${subject}").` },
      ],
    };
  },
);

server.tool(
  "reset",
  "Reset the inbox to its seeded state and clear the outbox.",
  {},
  async () => {
    seedState();
    return { content: [{ type: "text", text: `Inbox reset to scenario '${SCENARIO}'.` }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
