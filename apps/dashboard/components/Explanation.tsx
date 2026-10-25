import { splitOnValue, type ExplanationView } from "@/lib/replay";
import { CornerMarks } from "@/components/Panel";

/**
 * The injected sentence shown in its source document, lit up as if under a UV
 * lamp (red), with a "Hidden text" tag when the email hid it from the user
 * (white-on-white, display:none, …). Reads the explanation field via
 * `explanationsOf`, so it renders nothing until an event carries one.
 */
export function Explanation({ items }: { items: ExplanationView[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {items.map((h, i) => {
        const [pre, val, post] = splitOnValue(h.sentence, h.value);
        return (
          <figure key={i} className="relative border border-border bg-panel">
            <CornerMarks />
            <figcaption className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2.5">
              <span className="display-caps text-base text-muted">
                Planted instruction{h.source ? <span className="normal-case tracking-normal"> · from {h.source}</span> : null}
              </span>
              {h.hidden && <HiddenTag how={h.hiddenHow} />}
            </figcaption>
            <blockquote className="whitespace-pre-wrap px-5 py-5 font-mono text-xl leading-relaxed">
              {h.context && <span className="text-muted">{trimStart(h.context.before)}</span>}
              <mark className="uv-reveal">
                {pre}
                {val && <strong className="font-bold underline decoration-2 underline-offset-4">{val}</strong>}
                {post}
              </mark>
              {h.context && <span className="text-muted">{trimEnd(h.context.after)}</span>}
            </blockquote>
          </figure>
        );
      })}
    </div>
  );
}

/** Red stenciled tag: the user never saw this text. */
export function HiddenTag({ how }: { how?: string }) {
  return (
    <span className="display-caps inline-flex items-center gap-2 border border-block bg-block px-2 py-0.5 text-base leading-none text-black">
      Hidden text
      {how && <span className="font-mono text-sm normal-case tracking-normal">({how})</span>}
    </span>
  );
}

/** Keep about 160 chars of context on each side. */
const trimStart = (s: string) => (s.length > 160 ? `…${s.slice(-160)}` : s);
const trimEnd = (s: string) => (s.length > 160 ? `${s.slice(0, 160)}…` : s);
