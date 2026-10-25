import Link from "next/link";

const LINKS = [
  { href: "/", label: "Session" },
  { href: "/redteam", label: "Red Team" },
];

export function Nav() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
        <span className="text-lg font-bold tracking-tight">Tripwire</span>
        <nav className="flex gap-4 text-sm">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
