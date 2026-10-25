/**
 * Shows the proxy's mode as an arm/disarm switch. It is an indicator, not a
 * control: the mode is set when the proxy starts (`--mode`), and nothing in the
 * dashboard can change it, so it says so on its face.
 */
export function ArmSwitch({ mode }: { mode: string | undefined }) {
  const armed = mode === "enforce";
  const monitor = mode === "monitor";
  const word = armed ? "Armed" : monitor ? "Watching" : mode === "off" ? "Disarmed" : "No session";
  const note = armed
    ? "Blocks attacks"
    : monitor
      ? "Logs only, blocks nothing"
      : mode === "off"
        ? "Nothing is checked"
        : "";

  return (
    <div role="status" aria-label={`Tripwire ${word.toLowerCase()} (mode ${mode ?? "unknown"}, set when the proxy starts)`} className="flex items-center gap-4">
      {/* Switch housing; the lever is fixed, there is nothing to flip. */}
      <span aria-hidden className="relative block h-9 w-[4.5rem] border border-mark bg-background">
        <span
          className={`absolute top-1 h-[1.625rem] w-7 border ${
            armed ? "right-1 border-block bg-block" : "left-1 border-mark bg-panel-raised"
          }`}
        />
        <span
          className={`absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
            armed ? "left-2.5 bg-block shadow-[0_0_6px_2px_rgb(255_42_42/0.8)]" : "right-2.5 bg-mark"
          }`}
        />
      </span>
      <span className="flex flex-col leading-tight">
        <span className={`display-caps text-3xl ${armed ? "text-block" : "text-muted"}`}>{word}</span>
        <span className="font-mono text-sm text-muted">
          {note}
          {mode && (
            <>
              {note ? " · " : ""}set by <span className="whitespace-nowrap text-foreground">--mode {mode}</span>
            </>
          )}
        </span>
      </span>
    </div>
  );
}
