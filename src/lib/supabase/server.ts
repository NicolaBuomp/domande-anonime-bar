import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

// Client per Server Component: chiave anon + sessione dai cookie della richiesta.
// Uno nuovo per ogni richiesta (mai condiviso).
export async function getServerClient() {
  const store = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // da un Server Component i cookie non si scrivono: li aggiorna il proxy
          }
        },
      },
    },
  );
}
