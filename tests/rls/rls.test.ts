import { beforeAll, describe, expect, it } from "vitest";
import { admin, anon, resetDb } from "../setup/db";

// Con la chiave anon niente deve passare su questions e submit_log (spec §3.3).
// Ci sono righe vere nel DB, così un "[]" non può essere scambiato per un blocco.

const HASH = "a".repeat(64);

beforeAll(async () => {
  await resetDb();
  const q = await admin.from("questions").insert({ text: "Domanda segreta" });
  const l = await admin.from("submit_log").insert({ device_hash: HASH, ip_hash: HASH });
  if (q.error || l.error) throw new Error("seed RLS fallito");
});

describe("RLS: chiave anon su questions", () => {
  it("SELECT fallisce", async () => {
    const { data, error } = await anon().from("questions").select("*");
    expect(error?.code).toBe("42501"); // permission denied
    expect(data).toBeNull();
  });

  it("INSERT fallisce", async () => {
    const { error } = await anon().from("questions").insert({ text: "dal client" });
    expect(error?.code).toBe("42501");
    const { count } = await admin.from("questions").select("*", { count: "exact", head: true });
    expect(count).toBe(1);
  });

  it("UPDATE e DELETE falliscono", async () => {
    const u = await anon().from("questions").update({ status: "on_air" }).not("id", "is", null);
    const d = await anon().from("questions").delete().not("id", "is", null);
    expect(u.error?.code).toBe("42501");
    expect(d.error?.code).toBe("42501");
  });
});

describe("RLS: chiave anon su submit_log", () => {
  it("SELECT fallisce", async () => {
    const { data, error } = await anon().from("submit_log").select("*");
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();
  });

  it("INSERT fallisce", async () => {
    const { error } = await anon().from("submit_log").insert({ device_hash: HASH, ip_hash: HASH });
    expect(error?.code).toBe("42501");
  });
});

describe("RLS: funzioni", () => {
  it("anon non può chiamare submit_question", async () => {
    const { error } = await anon().rpc("submit_question", {
      p_text: "bypass della route",
      p_device_hash: HASH,
      p_ip_hash: HASH,
      p_cooldown_s: 0,
      p_max_per_window: 1000,
      p_window_h: 1,
      p_ip_max_per_min: 1000,
    });
    expect(error?.code).toBe("42501");
    const { count } = await admin.from("questions").select("*", { count: "exact", head: true });
    expect(count).toBe(1);
  });
});
