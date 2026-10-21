import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/questions/route";
import { deviceHash, getSalt, ipHash } from "@/lib/device";
import { admin, countRows, newDevice, questionRequest, resetDb, type Device } from "../setup/db";

const send = (body: unknown, device: Device = newDevice()) => POST(questionRequest(body, device));

const hashesOf = (d: Device) => {
  const salt = getSalt();
  return {
    device_hash: deviceHash({ ip: d.ip, userAgent: d.ua, did: d.did, salt }),
    ip_hash: ipHash(d.ip, salt),
  };
};

/** Precompila submit_log con righe retrodatate (secondi fa). */
async function seedLog(rows: Array<{ device_hash: string; ip_hash: string; agoS: number }>) {
  const { error } = await admin.from("submit_log").insert(
    rows.map((r) => ({
      device_hash: r.device_hash,
      ip_hash: r.ip_hash,
      created_at: new Date(Date.now() - r.agoS * 1000).toISOString(),
    })),
  );
  if (error) throw error;
}

beforeEach(resetDb);

describe("POST /api/questions: casi ok", () => {
  it("salva domanda e log, imposta il cookie e non restituisce id né hash", async () => {
    const device = newDevice({ did: "not-a-uuid" }); // cookie non valido → nuovo did
    const res = await send(
      { text: "  Qual è il cocktail della casa?  ", nickname: "Marco" },
      device,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toMatch(/did=[0-9a-f-]{36}.*HttpOnly/i);

    const { data } = await admin.from("questions").select("text,nickname,status");
    expect(data).toEqual([
      { text: "Qual è il cocktail della casa?", nickname: "Marco", status: "new" },
    ]);
    expect(await countRows()).toEqual({ questions: 1, submitLog: 1 });
  });

  it("salva nickname vuoto come null e non reimposta un cookie valido", async () => {
    const res = await send({ text: "Domanda", nickname: "   " });
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toBeNull();
    const { data } = await admin.from("questions").select("nickname");
    expect(data).toEqual([{ nickname: null }]);
  });
});

describe("POST /api/questions: validazione", () => {
  it("testo di 301 caratteri → 400 too_long", async () => {
    const res = await send({ text: "a".repeat(301) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid", field: "text", reason: "too_long" });
    expect(await countRows()).toEqual({ questions: 0, submitLog: 0 });
  });

  it("testo di 300 caratteri → 201", async () => {
    expect((await send({ text: "a".repeat(300) })).status).toBe(201);
  });

  it("testo vuoto o solo spazi → 400 empty", async () => {
    const res = await send({ text: "  \n  " });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "text", reason: "empty" });
  });

  it("nickname di 31 caratteri → 400", async () => {
    const res = await send({ text: "ok", nickname: "n".repeat(31) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "nickname", reason: "too_long" });
  });

  it.each([
    ["JSON non valido", "{non json"],
    ["array", "[1,2]"],
    ["text non stringa", JSON.stringify({ text: 42 })],
    ["body oltre 2 KB", JSON.stringify({ text: "a".repeat(3000) })],
  ])("%s → 400 bad_request", async (_, raw) => {
    const res = await POST(questionRequest(null, newDevice(), raw));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });
});

describe("POST /api/questions: antispam", () => {
  it("honeypot compilato → 201 finto, nessuna riga", async () => {
    const res = await send({ text: "Compra ora!", website: "http://spam.example" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(await countRows()).toEqual({ questions: 0, submitLog: 0 });
  });

  it("parolaccia nel testo → 422, nessuna riga", async () => {
    const res = await send({ text: "Sei uno str0nz0" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "rejected" });
    expect(await countRows()).toEqual({ questions: 0, submitLog: 0 });
  });

  it("parolaccia nel nickname → 422", async () => {
    expect((await send({ text: "Ciao", nickname: "porcodio" })).status).toBe(422);
  });

  it("secondo invio entro 60 s dallo stesso dispositivo → 429 cooldown con Retry-After", async () => {
    const device = newDevice();
    expect((await send({ text: "Prima" }, device)).status).toBe(201);
    const res = await send({ text: "Seconda" }, device);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("cooldown");
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(body.retryAfter).toBeLessThanOrEqual(60);
    expect(res.headers.get("retry-after")).toBe(String(body.retryAfter));
    expect(await countRows()).toEqual({ questions: 1, submitLog: 1 });
  });

  it("stesso IP e stesso user agent ma did diverso → due dispositivi distinti", async () => {
    const a = newDevice();
    const b = newDevice({ ip: a.ip, ua: a.ua });
    expect((await send({ text: "Da A" }, a)).status).toBe(201);
    expect((await send({ text: "Da B" }, b)).status).toBe(201);
  });

  it("undicesimo invio in 12 ore → 429 daily_limit", async () => {
    const device = newDevice();
    const h = hashesOf(device);
    await seedLog(Array.from({ length: 10 }, (_, i) => ({ ...h, agoS: 3600 + i * 120 })));

    const res = await send({ text: "Undicesima" }, device);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_limit" });
  });

  it("invii più vecchi di 12 ore non contano per il tetto", async () => {
    const device = newDevice();
    const h = hashesOf(device);
    await seedLog(Array.from({ length: 10 }, (_, i) => ({ ...h, agoS: 13 * 3600 + i })));
    expect((await send({ text: "Nuova serata" }, device)).status).toBe(201);
  });

  it("31° invio in un minuto dallo stesso IP con dispositivi diversi → 429 busy", async () => {
    const ip = newDevice().ip;
    const others = Array.from({ length: 30 }, () => hashesOf(newDevice({ ip })));
    await seedLog(others.map((h, i) => ({ ...h, agoS: 5 + i })));

    const res = await send({ text: "Trentunesima" }, newDevice({ ip }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("busy");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("due richieste concorrenti dallo stesso dispositivo → una sola accettata", async () => {
    const device = newDevice();
    const results = await Promise.all([
      send({ text: "Gemella 1" }, device),
      send({ text: "Gemella 2" }, device),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 429]);
    expect(await countRows()).toEqual({ questions: 1, submitLog: 1 });
  });

  it("le risposte di errore non contengono hash né id", async () => {
    const device = newDevice();
    await send({ text: "Prima" }, device);
    const text = await (await send({ text: "Seconda" }, device)).text();
    expect(text).not.toMatch(/[0-9a-f]{64}/);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe("POST /api/questions: kill switch", () => {
  afterEach(() => {
    delete process.env.SUBMISSIONS_OPEN;
  });

  it("SUBMISSIONS_OPEN=false → 503 closed, nessuna riga", async () => {
    process.env.SUBMISSIONS_OPEN = "false";
    const res = await send({ text: "C'è ancora tempo?" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "closed" });
    expect(await countRows()).toEqual({ questions: 0, submitLog: 0 });
  });
});
