// Esegue un comando con le chiavi dello stack Supabase locale, senza bisogno di .env.local.
// Uso: node scripts/with-local-env.mjs next dev        (prima: supabase start)
//      node scripts/with-local-env.mjs next start   (porta da PORT)
import { execFileSync, spawn } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("Uso: node scripts/with-local-env.mjs <comando> [argomenti]");
  process.exit(1);
}

let status;
try {
  status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch {
  console.error("Avvia Supabase: supabase start");
  process.exit(1);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  SUBMIT_SALT: process.env.SUBMIT_SALT ?? "dev-salt-0123456789abcdef0123456789abcdef",
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

const child = spawn("npx", [cmd, ...args], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
