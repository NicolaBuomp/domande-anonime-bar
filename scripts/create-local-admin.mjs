// Crea un gestore nel Supabase LOCALE (utente confermato + riga in app_admins).
// Uso: npm run admin:local -- tu@example.test        (prima: supabase start)
// Password: ADMIN_PASSWORD se impostata, altrimenti generata e stampata una volta qui.
// Mai contro la produzione: lì si segue docs/runbook.md.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Uso: npm run admin:local -- <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error(`Rifiutato: ${url || "(nessun URL)"} non è il Supabase locale.`);
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error || !data.user) {
  console.error(`Utente non creato: ${error?.message}`);
  process.exit(1);
}
const ins = await supabase.from("app_admins").insert({ user_id: data.user.id });
if (ins.error) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error(`app_admins: ${ins.error.message}`);
  process.exit(1);
}

console.log(`Gestore creato: ${email}`);
if (!process.env.ADMIN_PASSWORD) console.log(`Password: ${password}`);
console.log("Entra da http://localhost:3000/admin/login");
