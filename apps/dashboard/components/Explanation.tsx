import { splitOnValue, type ExplanationView } from "@/lib/replay";

/**
 * The injected sentence, highlighted red, with a "hidden text" label when the
 * email hid it from the user (white-on-white, display:none, …). Reads the
 * explanation field via `explanationsOf`, so it renders nothing until events
 * carry one.
 */
export function Explanation({ items }: { items: ExplanationView[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {items.map((h, i) => {
        const [pre, val, post] = splitOnValue(h.sentence, h.value);
        return (
          <div key={i} className="rounded-lg border border-block bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <span>Injected instruction{h.source ? ` · from ${h.source}` : ""}</span>
              {h.hidden && (
                <span className="rounded-full bg-block px-2 py-0.5 font-semibold text-white">
                  Hidden text{h.hiddenHow ? ` (${h.hiddenHow})` : ""}
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed">
              {h.context && <span className="text-muted">{trimStart(h.context.before)}</span>}
              <mark className="rounded bg-block-bg px-1 text-block">
                {pre}
                {val && <strong className="underline decoration-2">{val}</strong>}
                {post}
              </mark>
              {h.context && <span className="text-muted">{trimEnd(h.context.after)}</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Keep about 160 chars of context on each side. */
const trimStart = (s: string) => (s.length > 160 ? `…${s.slice(-160)}` : s);
const trimEnd = (s: string) => (s.length > 160 ? `${s.slice(0, 160)}…` : s);
