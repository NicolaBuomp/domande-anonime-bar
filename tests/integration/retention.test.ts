import { beforeEach, describe, expect, it } from "vitest";
import { admin, anon, resetDb } from "../setup/db";

// Retention 48 h (spec §3.6): purge_expired() cancella il vecchio, tiene il recente.

const HASH = (c: string) => c.repeat(64);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function count(table: "questions" | "submit_log") {
  const { count } = await admin.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

beforeEach(resetDb);

describe("purge_expired", () => {
  it("cancella le righe oltre 48 h e tiene quelle più recenti", async () => {
    await admin.from("questions").insert([
      { text: "Vecchia", created_at: hoursAgo(49) },
      { text: "Recente", created_at: hoursAgo(47) },
    ]);
    await admin.from("submit_log").insert([
      { device_hash: HASH("a"), ip_hash: HASH("a"), created_at: hoursAgo(49) },
      { device_hash: HASH("b"), ip_hash: HASH("b"), created_at: hoursAgo(47) },
    ]);

    const { data, error } = await admin.rpc("purge_expired");
    expect(error).toBeNull();
    expect(data).toEqual({ questions: 1, submit_log: 1 });

    const { data: left } = await admin.from("questions").select("text");
    expect(left).toEqual([{ text: "Recente" }]);
    expect(await count("submit_log")).toBe(1);
  });

  it("se la domanda in onda è scaduta, lo schermo torna in attesa", async () => {
    await admin.from("questions").insert({
      text: "In onda da due giorni",
      status: "on_air",
      created_at: hoursAgo(50),
    });
    const before = await anon().from("screen_state").select("text").single();
    expect(before.data?.text).toBe("In onda da due giorni");

    await admin.rpc("purge_expired");
    const after = await anon().from("screen_state").select("text").single();
    expect(after.data?.text).toBeNull();
  });

  it("anon e utenti non possono lanciarla né leggere lo stato", async () => {
    expect((await anon().rpc("purge_expired")).error?.code).toBe("42501");
    expect((await anon().rpc("retention_status")).error?.code).toBe("42501");
  });
});

describe("retention_status", () => {
  it("il job orario esiste, è attivo e non restano righe scadute dopo la pulizia", async () => {
    await admin.from("questions").insert({ text: "Vecchia", created_at: hoursAgo(72) });
    const pre = await admin.rpc("retention_status");
    expect(pre.data).toMatchObject({ expired_rows: { questions: 1, submit_log: 0 } });

    await admin.rpc("purge_expired");
    const { data, error } = await admin.rpc("retention_status");
    expect(error).toBeNull();
    expect(data).toMatchObject({
      job: { schedule: "0 * * * *", active: true, command: "select public.purge_expired()" },
      expired_rows: { questions: 0, submit_log: 0 },
    });
  });
});
