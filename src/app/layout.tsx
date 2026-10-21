import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { site } from "@/config/site";
import "./globals.css";

// Un solo carattere per tutta l'app, ospitato da next/font (nessuna richiesta a Google dal browser).
const brand = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: `Domande anonime · ${site.barName}`,
  description: `Fai una domanda anonima a ${site.barName}.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${brand.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
