import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// Contro la preview: E2E_BASE_URL (+ VERCEL_AUTOMATION_BYPASS_SECRET).
// In locale: build + start con le chiavi dello stack Supabase locale.
const remote = process.env.E2E_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
// porta dedicata (E2E_PORT): la 3000 può essere occupata da un `next dev` lasciato aperto.
// Mai riusare un server già in ascolto: potrebbe essere un'altra app (è successo con la 3100).
const PORT = Number(process.env.E2E_PORT ?? 3197);

function localEnv(): Record<string, string> {
  const s = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as Record<string, string>;
  return {
    NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: s.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,
    SUBMIT_SALT: "e2e-salt-0123456789abcdef0123456789abcdef",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  };
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: remote ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: remote
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: localEnv(),
      },
});
