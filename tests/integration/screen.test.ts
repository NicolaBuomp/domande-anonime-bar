import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { admin, anon, resetDb } from "../setup/db";
import { createUser, deleteUser, signedInClient, type TestUser } from "../setup/users";

// screen_state segue la domanda in onda qualunque sia il percorso (spec §3.1).

let adminUser: TestUser;
let asAdmin: SupabaseClient<Database>;

const screen = async () => {
  const { data, error } = await anon().from("screen_state").select("*").single();
  if (error) throw error;
  return data;
};

async function seed(text: string, nickname: string | null = null) {
  const { data, error } = await admin
    .from("questions")
    .insert({ text, nickname })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  adminUser = await createUser({ isAdmin: true });
  asAdmin = await signedInClient(adminUser);
});
afterAll(() => deleteUser(adminUser));
beforeEach(resetDb);

describe("trigger sync_screen_state", () => {
  it("parte vuoto e resta vuoto con le sole domande nuove", async () => {
    await seed("Solo nuova");
    expect(await screen()).toMatchObject({ text: null, nickname: null });
  });

  it("go_on_air → testo e nickname sullo schermo", async () => {
    const id = await seed("In onda?", "Giulia");
    await asAdmin.rpc("go_on_air", { p_id: id });
    expect(await screen()).toMatchObject({ text: "In onda?", nickname: "Giulia" });
  });

  it("go_on_air sulla successiva → lo schermo passa alla nuova", async () => {
    const a = await seed("Prima");
    const b = await seed("Seconda", null);
    await asAdmin.rpc("go_on_air", { p_id: a });
    await asAdmin.rpc("go_on_air", { p_id: b });
    expect(await screen()).toMatchObject({ text: "Seconda", nickname: null });
  });

  it("mark_read → schermo in attesa", async () => {
    const id = await seed("Da leggere");
    await asAdmin.rpc("go_on_air", { p_id: id });
    await asAdmin.rpc("mark_read", { p_id: id });
    expect(await screen()).toMatchObject({ text: null, nickname: null });
  });

  it("DELETE della domanda in onda → schermo in attesa", async () => {
    const id = await seed("Da eliminare");
    await asAdmin.rpc("go_on_air", { p_id: id });
    await asAdmin.from("questions").delete().eq("id", id);
    expect(await screen()).toMatchObject({ text: null, nickname: null });
  });

  it("cancellazione diretta (cron / SQL d'emergenza) → schermo in attesa", async () => {
    const id = await seed("Vecchia");
    await asAdmin.rpc("go_on_air", { p_id: id });
    await admin.from("questions").delete().not("id", "is", null);
    expect(await screen()).toMatchObject({ text: null, nickname: null });
  });

  it("una nuova domanda non tocca lo schermo (niente eventi inutili)", async () => {
    const id = await seed("Stabile");
    await asAdmin.rpc("go_on_air", { p_id: id });
    const before = (await screen()).updated_at;
    await seed("Arriva un'altra");
    expect((await screen()).updated_at).toBe(before);
  });
});

describe("RLS su screen_state", () => {
  it("anon legge una sola riga senza riferimenti alla domanda", async () => {
    const { data, error } = await anon().from("screen_state").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(Object.keys(data![0]).sort()).toEqual(["id", "nickname", "text", "updated_at"]);
  });

  it("anon non può scrivere", async () => {
    const u = await anon().from("screen_state").update({ text: "hack" }).eq("id", 1);
    const i = await anon().from("screen_state").insert({ id: 1, text: "hack" });
    const d = await anon().from("screen_state").delete().eq("id", 1);
    expect(u.error?.code).toBe("42501");
    expect(i.error?.code).toBe("42501");
    expect(d.error?.code).toBe("42501");
    expect((await screen()).text).toBeNull();
  });

  it("nemmeno l'admin scrive direttamente su screen_state", async () => {
    const u = await asAdmin.from("screen_state").update({ text: "hack" }).eq("id", 1);
    expect(u.error?.code).toBe("42501");
  });
});
