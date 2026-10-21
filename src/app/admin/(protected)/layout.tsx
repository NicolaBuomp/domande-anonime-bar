import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";

// Seconda barriera dopo il proxy: verifica autorevole della sessione lato server.
// (I dati restano comunque protetti dalla RLS is_admin().)
export default async function ProtectedLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login?next=/admin");

  return children;
}
