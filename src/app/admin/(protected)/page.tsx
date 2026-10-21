import type { Metadata } from "next";
import { site } from "@/config/site";
import { t } from "@/lib/strings";
import { AdminBoard } from "./AdminBoard";

export const metadata: Metadata = { title: `${t.admin.title} · ${site.barName}` };

export default function AdminPage() {
  return <AdminBoard />;
}
