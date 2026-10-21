import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client con service role: SOLO per POST /api/questions. Mai importarlo da un Client
// Component (lo impedisce `server-only` in build) e mai esporre la chiave con NEXT_PUBLIC_.
let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service client non configurato");
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
