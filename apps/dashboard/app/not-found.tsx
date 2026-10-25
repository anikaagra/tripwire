import Link from "next/link";
import { Panel } from "@/components/Panel";

/** Any unknown URL: same plate as the other empty states, with a way back. */
export default function NotFound() {
  return (
    <Panel>
      <h1 className="display-caps text-4xl">Nothing at this address</h1>
      <p className="mt-3 text-lg text-muted">
        Go to the{" "}
        <Link href="/" className="text-foreground underline underline-offset-4">
          live session
        </Link>
        , the{" "}
        <Link href="/redteam" className="text-foreground underline underline-offset-4">
          Red Team scoreboard
        </Link>
        , or{" "}
        <Link href="/replay" className="text-foreground underline underline-offset-4">
          replay
        </Link>
        .
      </p>
    </Panel>
  );
}
