import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { admin, anon, resetDb } from "../setup/db";
import { createUser, deleteUser, signedInClient, type TestUser } from "../setup/users";

// RLS per utenti autenticati (spec §3.3): solo chi è in app_admins vede e agisce.

let adminUser: TestUser;
let otherUser: TestUser;
let asAdmin: SupabaseClient<Database>;
let asOther: SupabaseClient<Database>;

async function seed(texts: string[]) {
  const { data, error } = await admin
    .from("questions")
    .insert(texts.map((text) => ({ text })))
    .select("id,text");
  if (error) throw error;
  return data;
}

async function statusOf(id: string) {
  const { data } = await admin.from("questions").select("status").eq("id", id).single();
  return data?.status;
}

beforeAll(async () => {
  adminUser = await createUser({ isAdmin: true });
  otherUser = await createUser({ isAdmin: false });
  asAdmin = await signedInClient(adminUser);
  asOther = await signedInClient(otherUser);
});

afterAll(async () => {
  await deleteUser(adminUser);
  await deleteUser(otherUser);
});

beforeEach(resetDb);

describe("auth", () => {
  it("il signup pubblico è disattivato (ma il login email funziona)", async () => {
    const { data, error } = await anon().auth.signUp({
      email: `intruso-${Date.now()}@example.test`,
      password: "Password-di-prova-123",
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});

describe("utente autenticato NON admin", () => {
  it("SELECT su questions restituisce zero righe", async () => {
    await seed(["Una", "Due"]);
    const { data, error } = await asOther.from("questions").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("DELETE non cancella nulla", async () => {
    const [q] = await seed(["Resto qui"]);
    await asOther.from("questions").delete().eq("id", q.id);
    expect(await statusOf(q.id)).toBe("new");
  });

  it("go_on_air e mark_read falliscono con forbidden", async () => {
    const [q] = await seed(["Non mia"]);
    const a = await asOther.rpc("go_on_air", { p_id: q.id });
    const b = await asOther.rpc("mark_read", { p_id: q.id });
    expect(a.error?.code).toBe("42501");
    expect(b.error?.code).toBe("42501");
    expect(await statusOf(q.id)).toBe("new");
  });

  it("non può leggere submit_log né app_admins", async () => {
    expect((await asOther.from("submit_log").select("*")).error?.code).toBe("42501");
    expect((await asOther.from("app_admins").select("*")).error?.code).toBe("42501");
  });

  it("non può inserire o aggiornare domande direttamente", async () => {
    const [q] = await seed(["Intoccabile"]);
    const i = await asOther.from("questions").insert({ text: "x" });
    const u = await asOther.from("questions").update({ status: "on_air" }).eq("id", q.id);
    expect(i.error?.code).toBe("42501");
    expect(u.error?.code).toBe("42501");
  });
});

describe("admin", () => {
  it("vede le domande ma non submit_log", async () => {
    await seed(["Una", "Due"]);
    const { data } = await asAdmin.from("questions").select("text").order("text");
    expect(data).toEqual([{ text: "Due" }, { text: "Una" }]);
    expect((await asAdmin.from("submit_log").select("*")).error?.code).toBe("42501");
  });

  it("non può aggiornare direttamente (solo via funzioni)", async () => {
    const [q] = await seed(["Diretta"]);
    const u = await asAdmin.from("questions").update({ status: "read" }).eq("id", q.id);
    expect(u.error?.code).toBe("42501");
  });

  it("go_on_air: la precedente diventa letta, mai due in onda", async () => {
    const [a, b] = await seed(["Prima", "Seconda"]);
    expect((await asAdmin.rpc("go_on_air", { p_id: a.id })).error).toBeNull();
    expect(await statusOf(a.id)).toBe("on_air");

    expect((await asAdmin.rpc("go_on_air", { p_id: b.id })).error).toBeNull();
    expect(await statusOf(a.id)).toBe("read");
    expect(await statusOf(b.id)).toBe("on_air");

    const { count } = await admin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("status", "on_air");
    expect(count).toBe(1);
  });

  it("go_on_air su una domanda già letta fallisce (niente ritorni indietro)", async () => {
    const [q] = await seed(["Letta"]);
    await asAdmin.rpc("mark_read", { p_id: q.id });
    const { error } = await asAdmin.rpc("go_on_air", { p_id: q.id });
    expect(error?.code).toBe("P0002");
    expect(await statusOf(q.id)).toBe("read");
  });

  it("mark_read: new → read e on_air → read", async () => {
    const [a, b] = await seed(["Nuova", "In onda"]);
    await asAdmin.rpc("go_on_air", { p_id: b.id });
    expect((await asAdmin.rpc("mark_read", { p_id: a.id })).error).toBeNull();
    expect((await asAdmin.rpc("mark_read", { p_id: b.id })).error).toBeNull();
    expect(await statusOf(a.id)).toBe("read");
    expect(await statusOf(b.id)).toBe("read");
  });

  it("DELETE cancella definitivamente", async () => {
    const [q] = await seed(["Via"]);
    const { error } = await asAdmin.from("questions").delete().eq("id", q.id);
    expect(error).toBeNull();
    const { count } = await admin.from("questions").select("*", { count: "exact", head: true });
    expect(count).toBe(0);
  });

  it("due go_on_air concorrenti: vince l'ultima, sempre una sola in onda", async () => {
    const [a, b] = await seed(["Tap 1", "Tap 2"]);
    const results = await Promise.all([
      asAdmin.rpc("go_on_air", { p_id: a.id }),
      asAdmin.rpc("go_on_air", { p_id: b.id }),
    ]);
    expect(results.every((r) => r.error === null)).toBe(true);
    const { data } = await admin.from("questions").select("id").eq("status", "on_air");
    expect(data).toHaveLength(1);
  });
});
