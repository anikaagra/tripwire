import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { JUDGE_SYSTEM_PROMPT, buildJudgeMessage } from "./prompt.js";
import type { GuardInput, GuardVerdict } from "@tripwire/shared";

export const JUDGE_MODEL = "claude-haiku-5-5";
export const JUDGE_MAX_TOKENS = 150;
/**
 * Safety cut-off per attempt, not the latency target (that's 1.5 s).
 * Live Haiku calls measured 1.1–1.7 s, so 1.5 s cut off real answers.
 */
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 2500;
/** First try plus one retry, per the design doc. */
export const DEFAULT_MAX_ATTEMPTS = 2;

export const FAIL_CLOSED_REASON =
  "Tripwire couldn't check this action automatically, so it needs your approval.";

/**
 * The one method judge() needs. The real Anthropic client satisfies this,
 * and tests pass a fake so they run offline and cost nothing.
 */
export interface JudgeClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: Anthropic.RequestOptions,
    ): PromiseLike<Anthropic.Message>;
  };
}

/**
 * A GuardVerdict plus timing and failure details. Assignable to GuardVerdict,
 * so it drops into the proxy pipeline as-is.
 */
export interface JudgeResult extends GuardVerdict {
  latencyMs: number;
  /** Set when the judge failed closed (error, timeout, refusal, bad JSON). */
  error?: string;
}

export interface JudgeOptions {
  client?: JudgeClient;
  attemptTimeoutMs?: number;
  maxAttempts?: number;
}

const VerdictSchema = z.object({
  requested: z.enum(["yes", "no", "unclear"]),
  reason: z.string().min(1),
});

// Structured outputs make Haiku reply in exactly this shape.
const VERDICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    requested: { type: "string", enum: ["yes", "no", "unclear"] },
    reason: { type: "string" },
  },
  required: ["requested", "reason"],
  additionalProperties: false,
};

/** A failure where retrying the same request won't help. */
class NonRetryableError extends Error {}

let defaultClient: JudgeClient | undefined;

/** Reads ANTHROPIC_API_KEY from the environment; never hardcode a key. */
function getDefaultClient(): JudgeClient {
  defaultClient ??= new Anthropic();
  return defaultClient;
}

function isNonRetryable(err: unknown): boolean {
  return (
    err instanceof NonRetryableError ||
    err instanceof Anthropic.BadRequestError ||
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.NotFoundError
  );
}

function parseVerdict(response: Anthropic.Message): z.infer<typeof VerdictSchema> {
  if (response.stop_reason === "refusal") {
    throw new NonRetryableError("model refused");
  }
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`unparseable response (stop_reason: ${response.stop_reason})`);
  }
  const parsed = VerdictSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("response did not match the verdict schema");
  }
  return parsed.data;
}

async function askOnce(
  client: JudgeClient,
  input: GuardInput,
  timeoutMs: number,
): Promise<z.infer<typeof VerdictSchema>> {
  const controller = new AbortController();
  const timedOut = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error(`timed out after ${timeoutMs} ms`)),
      { once: true },
    );
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await Promise.race([
      client.messages.create(
        {
          model: JUDGE_MODEL,
          max_tokens: JUDGE_MAX_TOKENS,
          system: JUDGE_SYSTEM_PROMPT,
          // A short classification: no thinking, low effort, for speed.
          // (temperature is not accepted by current models; the JSON schema
          // keeps the output predictable instead.)
          thinking: { type: "disabled" },
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: VERDICT_JSON_SCHEMA },
          },
          messages: [{ role: "user", content: buildJudgeMessage(input) }],
        },
        // We do our own single retry, so turn off the SDK's.
        { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 },
      ),
      timedOut,
    ]);
    return parseVerdict(response);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask Claude Haiku whether the user actually requested this tool call.
 *
 * Fails closed: any error, timeout, refusal, or unparseable answer returns
 * requested: "unclear" (which decide() turns into ask or block), never "yes".
 */
export async function judge(
  input: GuardInput,
  options: JudgeOptions = {},
): Promise<JudgeResult> {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  const timeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let lastError = "no attempts made";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = options.client ?? getDefaultClient();
      const { requested, reason } = await askOnce(client, input, timeoutMs);
      return { requested, reason, latencyMs: elapsed() };
    } catch (err) {
      lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      if (isNonRetryable(err)) break;
    }
  }

  return {
    requested: "unclear",
    reason: FAIL_CLOSED_REASON,
    latencyMs: elapsed(),
    error: lastError,
  };
}
