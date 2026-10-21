import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// In locale crea un gestore di test con password casuale (mai scritta su file) e
// lo cancella alla fine. Contro la preview servono E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD
// del gestore di test del progetto staging, passati come variabili d'ambiente.
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) {
    if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
      throw new Error("Contro la preview servono E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD (staging)");
    }
    return;
  }

  const s = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as Record<string, string>;
  const admin = createClient(s.API_URL, s.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `e2e-admin-${randomUUID()}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`e2e admin: ${error?.message}`);
  const ins = await admin.from("app_admins").insert({ user_id: data.user.id });
  if (ins.error) throw new Error(`e2e app_admins: ${ins.error.message}`);

  process.env.E2E_ADMIN_EMAIL = email;
  process.env.E2E_ADMIN_PASSWORD = password;

  const userId = data.user.id;
  return async () => {
    await admin.auth.admin.deleteUser(userId);
  };
}
