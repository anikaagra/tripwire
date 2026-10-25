import type { ReactNode } from "react";

const CORNERS = [
  "left-[-1px] top-[-1px] border-l border-t",
  "right-[-1px] top-[-1px] border-r border-t",
  "left-[-1px] bottom-[-1px] border-l border-b",
  "right-[-1px] bottom-[-1px] border-r border-b",
];

/** The four registration marks that make a box read as a machined plate. */
export function CornerMarks({ tone = "mark" }: { tone?: "mark" | "block" | "ask" }) {
  const color = tone === "block" ? "border-block" : tone === "ask" ? "border-ask" : "border-mark";
  return (
    <>
      {CORNERS.map((c) => (
        <span key={c} aria-hidden className={`pointer-events-none absolute h-2.5 w-2.5 ${color} ${c}`} />
      ))}
    </>
  );
}

/**
 * A flat metal plate: hairline border, square corners, registration marks.
 * `title` renders as a stenciled label strip along the top edge.
 */
export function Panel({
  title,
  aside,
  tone = "mark",
  className = "",
  bodyClassName = "p-5",
  children,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  tone?: "mark" | "block" | "ask";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const border = tone === "block" ? "border-block/70" : tone === "ask" ? "border-ask/70" : "border-border";
  return (
    <section className={`relative border bg-panel ${border} ${className}`}>
      <CornerMarks tone={tone} />
      {(title || aside) && (
        <header className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-2.5">
          {title && <h2 className="display-caps text-base text-muted">{title}</h2>}
          {aside && <div className="font-mono text-sm text-muted">{aside}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Small stenciled label above a value. */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`display-caps text-sm text-muted ${className}`}>{children}</div>;
}
