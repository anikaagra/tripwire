import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { FAIL_CLOSED_REASON, JUDGE_MODEL, judge, type JudgeClient } from "./judge.js";
import { JUDGE_SYSTEM_PROMPT } from "./prompt.js";
import type { GuardInput, GuardVerdict } from "@tripwire/shared";

// Compile-time check: judge fits the slot in apps/proxy's pipeline deps.
// If this line stops typechecking, the swap from guardStub breaks.
const _fitsPipeline: (input: GuardInput) => Promise<GuardVerdict> = judge;

const transferInput: GuardInput = {
  intent: "Summarize my unread emails and pay the electricity bill.",
  tool: "bank__transfer",
  trustedDescription: "Send money from the user's checking account to another account.",
  args: { to_account: "4417", amount: 2000, memo: "" },
};

/** A minimal Message, shaped like the SDK's response. */
function fakeMessage(
  content: Array<{ type: string; [key: string]: unknown }>,
  stop_reason = "end_turn",
): Anthropic.Message {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: JUDGE_MODEL,
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

const reply = (text: string) => fakeMessage([{ type: "text", text }]);

type Step = Anthropic.Message | Error | "hang";

/** A fake client that plays back one step per call and records each request. */
function fakeClient(steps: Step[]) {
  const calls: Array<{
    body: Anthropic.MessageCreateParamsNonStreaming;
    options?: Anthropic.RequestOptions;
  }> = [];
  const client: JudgeClient = {
    messages: {
      create(body, options) {
        calls.push({ body, options });
        const step = steps[calls.length - 1];
        if (step === undefined) throw new Error("fake client: no more steps");
        if (step === "hang") return new Promise<Anthropic.Message>(() => {});
        if (step instanceof Error) return Promise.reject(step);
        return Promise.resolve(step);
      },
    },
  };
  return { client, calls };
}

describe("judge", () => {
  it("returns the model's verdict when the JSON is valid", async () => {
    const { client, calls } = fakeClient([
      reply('{"requested":"no","reason":"You never asked to send money to account 4417."}'),
    ]);

    const verdict = await judge(transferInput, { client });

    expect(verdict.requested).toBe("no");
    expect(verdict.reason).toBe("You never asked to send money to account 4417.");
    expect(verdict.error).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it("sends the design-doc request settings", async () => {
    const { client, calls } = fakeClient([reply('{"requested":"yes","reason":"ok"}')]);

    await judge(transferInput, { client });

    const { body, options } = calls[0]!;
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(150);
    expect(body.system).toBe(JUDGE_SYSTEM_PROMPT);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.output_config?.format?.type).toBe("json_schema");
    expect(body).not.toHaveProperty("temperature");
    expect(body.messages).toHaveLength(1);
    expect(options?.maxRetries).toBe(0);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reads the text block even if a thinking block comes first", async () => {
    const { client } = fakeClient([
      fakeMessage([
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: '{"requested":"yes","reason":"You asked to pay the bill."}' },
      ]),
    ]);

    const verdict = await judge(transferInput, { client });

    expect(verdict.requested).toBe("yes");
  });

  it("retries once after an unparseable answer and uses the retry", async () => {
    const { client, calls } = fakeClient([
      reply("Sure! The answer is no."),
      reply('{"requested":"no","reason":"New account."}'),
    ]);

    const verdict = await judge(transferInput, { client });

    expect(calls).toHaveLength(2);
    expect(verdict.requested).toBe("no");
    expect(verdict.error).toBeUndefined();
  });

  it("fails closed to unclear after two unparseable answers", async () => {
    const { client, calls } = fakeClient([reply("not json"), reply("{")]);

    const verdict = await judge(transferInput, { client });

    expect(calls).toHaveLength(2);
    expect(verdict.requested).toBe("unclear");
    expect(verdict.reason).toBe(FAIL_CLOSED_REASON);
    expect(verdict.error).toMatch(/unparseable/);
  });

  it("fails closed when the JSON has the wrong shape", async () => {
    const bad = reply('{"requested":"maybe","reason":"hmm"}');
    const { client } = fakeClient([bad, bad]);

    const verdict = await judge(transferInput, { client });

    expect(verdict.requested).toBe("unclear");
    expect(verdict.error).toMatch(/schema/);
  });

  it("fails closed when the answer is cut off by max_tokens", async () => {
    const cut = fakeMessage([{ type: "text", text: '{"requested":"ye' }], "max_tokens");
    const { client } = fakeClient([cut, cut]);

    const verdict = await judge(transferInput, { client });

    expect(verdict.requested).toBe("unclear");
    expect(verdict.error).toMatch(/max_tokens/);
  });

  it("retries once after an API error, then fails closed", async () => {
    const { client, calls } = fakeClient([
      new Error("503 overloaded"),
      new Error("503 overloaded"),
    ]);

    const verdict = await judge(transferInput, { client });

    expect(calls).toHaveLength(2);
    expect(verdict.requested).toBe("unclear");
    expect(verdict.error).toMatch(/overloaded/);
  });

  it("does not retry an authentication error", async () => {
    const authError = new Anthropic.AuthenticationError(
      401,
      undefined,
      "invalid x-api-key",
      new Headers(),
    );
    const { client, calls } = fakeClient([authError, reply('{"requested":"yes","reason":"x"}')]);

    const verdict = await judge(transferInput, { client });

    expect(calls).toHaveLength(1);
    expect(verdict.requested).toBe("unclear");
  });

  it("does not retry a refusal, and fails closed", async () => {
    const { client, calls } = fakeClient([fakeMessage([], "refusal")]);

    const verdict = await judge(transferInput, { client });

    expect(calls).toHaveLength(1);
    expect(verdict.requested).toBe("unclear");
    expect(verdict.error).toMatch(/refused/);
  });

  it("times out, aborts the request, and fails closed", async () => {
    const { client, calls } = fakeClient(["hang", "hang"]);

    const verdict = await judge(transferInput, { client, attemptTimeoutMs: 20 });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.options?.signal?.aborted).toBe(true);
    expect(verdict.requested).toBe("unclear");
    expect(verdict.error).toMatch(/timed out/);
  });

  it("reports latency", async () => {
    const { client } = fakeClient([reply('{"requested":"yes","reason":"ok"}')]);

    const verdict = await judge(transferInput, { client });

    expect(verdict.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
