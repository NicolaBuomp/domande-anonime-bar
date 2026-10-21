import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_S,
  deviceHash,
  getClientIp,
  getSalt,
  ipHash,
  isValidDeviceId,
  newDeviceId,
} from "@/lib/device";
import {
  COOLDOWN_S,
  MAX_PER_WINDOW,
  WINDOW_H,
  ipMaxPerMinute,
  submissionsOpen,
} from "@/lib/limits";
import { containsProfanity } from "@/lib/profanity";
import { getServiceClient } from "@/lib/supabase/service";
import { validateQuestion } from "@/lib/text";

// Unico punto di scrittura delle domande (spec §2.2). Le risposte non contengono
// mai id, hash o stato; i log contengono solo codici di errore.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

type SubmitResult = {
  status: "ok" | "cooldown" | "daily_limit" | "busy";
  retry_after?: number | null;
};

function reply(status: number, body: Record<string, unknown>, retryAfter?: number) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  if (retryAfter != null) res.headers.set("Retry-After", String(retryAfter));
  return res;
}

const badRequest = () => reply(400, { error: "bad_request" });

export async function POST(req: NextRequest) {
  if (!submissionsOpen()) return reply(503, { error: "closed" });

  // 1. forma della richiesta
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return badRequest();
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return badRequest();

  let body: unknown;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return badRequest();
    body = JSON.parse(raw);
  } catch {
    return badRequest();
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return badRequest();
  const { text, nickname, website } = body as Record<string, unknown>;
  if (typeof text !== "string") return badRequest();
  if (nickname != null && typeof nickname !== "string") return badRequest();
  if (website != null && typeof website !== "string") return badRequest();

  // 2. honeypot: successo finto, niente salvataggio, non conta per il rate limit
  if (website && website.trim() !== "") return reply(201, { ok: true });

  // 3–4. normalizzazione e validazione
  const valid = validateQuestion(text, nickname ?? null);
  if (!valid.ok) {
    return reply(400, { error: "invalid", field: valid.field, reason: valid.reason });
  }

  // 5. filtro parolacce (su testo e nickname), non conta per il rate limit
  if (containsProfanity(valid.text) || (valid.nickname && containsProfanity(valid.nickname))) {
    return reply(422, { error: "rejected" });
  }

  // 6–7. chiavi antispam e inserimento atomico
  const existingDid = req.cookies.get(DEVICE_COOKIE)?.value;
  const did = isValidDeviceId(existingDid) ? existingDid : newDeviceId();

  let res: NextResponse;
  try {
    const salt = getSalt();
    const ip = getClientIp(req.headers);
    const userAgent = req.headers.get("user-agent") ?? "";

    const { data, error } = await getServiceClient().rpc("submit_question", {
      p_text: valid.text,
      p_nickname: valid.nickname,
      p_device_hash: deviceHash({ ip, userAgent, did, salt }),
      p_ip_hash: ipHash(ip, salt),
      p_cooldown_s: COOLDOWN_S,
      p_max_per_window: MAX_PER_WINDOW,
      p_window_h: WINDOW_H,
      p_ip_max_per_min: ipMaxPerMinute(),
    });
    if (error) throw new Error(`rpc:${error.code ?? "unknown"}`);

    const result = data as SubmitResult;
    const retryAfter = Math.max(1, Math.ceil(result.retry_after ?? 1));
    switch (result.status) {
      case "ok":
        res = reply(201, { ok: true });
        break;
      case "cooldown":
        res = reply(429, { error: "cooldown", retryAfter }, retryAfter);
        break;
      case "daily_limit":
        res = reply(429, { error: "daily_limit" });
        break;
      case "busy":
        res = reply(429, { error: "busy", retryAfter }, retryAfter);
        break;
      default:
        throw new Error("rpc:unexpected_status");
    }
  } catch (err) {
    console.error("[api/questions]", err instanceof Error ? err.message : "error");
    return reply(500, { error: "server" });
  }

  if (did !== existingDid) {
    res.cookies.set(DEVICE_COOKIE, did, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE_S,
    });
  }
  return res;
}
