import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { Nav } from "@/components/Nav";

// Fonts are committed (app/fonts) so the dashboard works offline on venue Wi-Fi.
const display = localFont({
  src: "./fonts/BigShouldersDisplay-Variable.ttf",
  variable: "--font-display-face",
  weight: "100 900",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/JetBrainsMono-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/JetBrainsMono-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tripwire",
  description: "A drop-in MCP proxy that stops AI agents from taking actions planted by text they read.",
};

// ?stage=1 (thicker beam, no scanlines, larger text) sticks for the browser
// session; ?stage=0 turns it off. Runs before paint so there's no flash.
const STAGE_SCRIPT = `try{var q=new URLSearchParams(location.search).get("stage");if(q==="1")sessionStorage.setItem("tripwire-stage","1");if(q==="0")sessionStorage.removeItem("tripwire-stage");if(sessionStorage.getItem("tripwire-stage")==="1")document.documentElement.dataset.stage="1"}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: STAGE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ConvexClientProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
