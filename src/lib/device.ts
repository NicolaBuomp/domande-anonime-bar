import "server-only";
import { createHash, randomUUID } from "node:crypto";

// Chiavi antispam (spec §3.2). IP, user agent e did in chiaro non escono mai da qui.

export const DEVICE_COOKIE = "did";
export const DEVICE_COOKIE_MAX_AGE_S = 2 * 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** IP del client come lo fornisce Vercel (x-real-ip, poi il primo di x-forwarded-for). */
export function getClientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

export function newDeviceId(): string {
  return randomUUID();
}

/** Accetta solo un UUID: un cookie manipolato viene sostituito con uno nuovo. */
export function isValidDeviceId(value: string | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function deviceHash(p: {
  ip: string;
  userAgent: string;
  did: string;
  salt: string;
}): string {
  return sha256(`${p.ip}|${p.userAgent}|${p.did}|${p.salt}`);
}

export function ipHash(ip: string, salt: string): string {
  return sha256(`ip|${ip}|${salt}`);
}

/** Il sale deve esistere ed essere lungo: senza, l'hash dell'IPv4 è reversibile. */
export function getSalt(env: Record<string, string | undefined> = process.env): string {
  const salt = env.SUBMIT_SALT ?? "";
  if (salt.length < 32) throw new Error("SUBMIT_SALT mancante o troppo corto");
  return salt;
}
