import type { Metadata } from "next";
import { getSiteUrl, site } from "@/config/site";
import { ScreenView } from "./ScreenView";

export const metadata: Metadata = { title: `Schermo · ${site.barName}` };

export default function ScreenPage() {
  return <ScreenView siteUrl={getSiteUrl()} />;
}
