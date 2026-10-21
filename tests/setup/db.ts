import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { inject } from "vitest";
import type { Database } from "@/lib/database.types";

// Utility condivise dai test di integrazione e RLS (DB locale, valori di test).

const sb = inject("supabase");
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = createClient<Database>(sb.url, sb.serviceRoleKey, noSession);
export const anon = () => createClient<Database>(sb.url, sb.anonKey, noSession);

export async function resetDb() {
  const q = await admin.from("questions").delete().not("id", "is", null);
  const l = await admin.from("submit_log").delete().gte("id", 0);
  if (q.error || l.error) throw new Error(`reset fallito: ${q.error?.message ?? l.error?.message}`);
}

export function randomIp() {
  const n = () => Math.floor(Math.random() * 254) + 1;
  return `10.${n()}.${n()}.${n()}`;
}

export type Device = { ip: string; ua: string; did: string };

export function newDevice(overrides: Partial<Device> = {}): Device {
  return { ip: randomIp(), ua: "Mozilla/5.0 (iPhone) test", did: randomUUID(), ...overrides };
}

/** Costruisce la richiesta come arriverebbe da Vercel per quel dispositivo. */
export function questionRequest(body: unknown, device: Device, raw?: string) {
  return new NextRequest("http://localhost/api/questions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": device.ip,
      "user-agent": device.ua,
      cookie: `did=${device.did}`,
    },
    body: raw ?? JSON.stringify(body),
  });
}

export async function countRows() {
  const q = await admin.from("questions").select("*", { count: "exact", head: true });
  const l = await admin.from("submit_log").select("*", { count: "exact", head: true });
  return { questions: q.count ?? 0, submitLog: l.count ?? 0 };
}
