import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { safeAdminPath } from "@/lib/next-path";
import { t } from "@/lib/strings";
import { getServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: `${t.login.title} · ${site.barName}` };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const next = safeAdminPath((await searchParams).next);

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <Image src={site.logoSrc} alt={site.barName} width={56} height={56} unoptimized />
        <h1 className="text-2xl font-bold">{t.login.title}</h1>
      </header>
      <LoginForm next={next} />
    </main>
  );
}
