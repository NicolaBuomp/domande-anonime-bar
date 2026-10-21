import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

export type LocalSupabase = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
};

declare module "vitest" {
  export interface ProvidedContext {
    supabase: LocalSupabase;
  }
}

// Le env di test non stanno in file: si leggono dallo stack locale (valori di test).
export default function setup(project: TestProject) {
  let raw: string;
  try {
    raw = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Avvia Supabase: supabase start");
  }
  const s = JSON.parse(raw) as Record<string, string>;
  if (!s.API_URL || !s.ANON_KEY || !s.SERVICE_ROLE_KEY) {
    throw new Error("Avvia Supabase: supabase start");
  }
  project.provide("supabase", {
    url: s.API_URL,
    anonKey: s.ANON_KEY,
    serviceRoleKey: s.SERVICE_ROLE_KEY,
    dbUrl: s.DB_URL,
  });
}
