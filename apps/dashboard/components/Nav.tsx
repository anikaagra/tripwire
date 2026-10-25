"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Beam } from "@/components/Beam";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/redteam", label: "Red Team" },
  { href: "/replay", label: "Replay" },
];

/** Pages that draw their own beam with the calls on it: the live session and a replay. */
const hasOwnBeam = (path: string) => path === "/" || /^\/replay\/[^/]+/.test(path);

export function Nav() {
  const pathname = usePathname() ?? "/";
  // The phone approval page is a single full-screen decision: no nav.
  if (pathname.startsWith("/approve")) return null;

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <header>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10 gap-y-2 px-6 pb-2 pt-5">
        <Link href="/" className="flex items-center gap-3" aria-label="Tripwire, live session">
          {/* the emitter */}
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-block shadow-[0_0_8px_2px_rgb(255_42_42/0.8)]" />
          <span className="display-caps text-2xl tracking-[0.2em] text-foreground">Tripwire</span>
        </Link>
        <nav className="flex gap-7">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active(link.href) ? "page" : undefined}
              className={`display-caps border-b-2 pb-0.5 text-lg ${
                active(link.href) ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {!hasOwnBeam(pathname) && <Beam className="-mb-3" />}
    </header>
  );
}
