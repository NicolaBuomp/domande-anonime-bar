import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Client browser con chiave anon: la protezione dei dati la fa la RLS.
// La sessione del gestore sta nei cookie, così proxy e server la vedono.
let client: SupabaseClient<Database> | null = null;

export function getBrowserClient(): SupabaseClient<Database> {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}
