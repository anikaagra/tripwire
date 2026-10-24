// Kept under the MCP SDK's own default per-request timeout (60s,
// DEFAULT_REQUEST_TIMEOUT_MSEC) so the proxy always resolves an ask to
// allow/block before the calling client's own request times out first.
export const APPROVAL_TIMEOUT_MS = 45_000;
export const GUARD_JUDGE_TIMEOUT_MS = 1_500;
export const MAX_ARG_TEXT_CHARS = 500;
export const ACCOUNT_DIGIT_RUN_MIN = 4;
export const ACCOUNT_DIGIT_RUN_MAX = 17;

export const TOOL_NAME_SEPARATOR = "__";

export function qualifiedToolName(server: string, tool: string): string {
  return `${server}${TOOL_NAME_SEPARATOR}${tool}`;
}

export function splitQualifiedToolName(qualified: string): { server: string; tool: string } {
  const idx = qualified.indexOf(TOOL_NAME_SEPARATOR);
  if (idx === -1) {
    throw new Error(`Not a qualified tool name: ${qualified}`);
  }
  return {
    server: qualified.slice(0, idx),
    tool: qualified.slice(idx + TOOL_NAME_SEPARATOR.length),
  };
}
