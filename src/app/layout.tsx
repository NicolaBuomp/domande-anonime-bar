import type { Metadata, Viewport } from "next";
import { site } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  title: `Domande anonime · ${site.barName}`,
  description: `Fai una domanda anonima a ${site.barName}.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111827",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
