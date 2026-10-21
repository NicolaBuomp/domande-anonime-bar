import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

// Accesso service role al DB LOCALE, solo per preparare dati negli e2e visivi.
export function localServiceClient() {
  const s = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as Record<string, string>;
  return createClient(s.API_URL, s.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const LONG_QUESTION =
  "Volevo chiedere una cosa che mi incuriosisce da tempo: come avete scelto il nome del locale, chi ha disegnato il logo, e se c'è una storia dietro al bancone di legno che sembra antichissimo? Ah, e già che ci sono: farete altre serate così anche il mese prossimo? Grazie mille, bella serata! A presto!";

/** Svuota e popola il DB con una serata realistica. */
export async function seedEvening() {
  const db = localServiceClient();
  await db.from("questions").delete().not("id", "is", null);
  await db.from("submit_log").delete().gte("id", 0);
  const rows = [
    {
      text: "Qual è il cocktail della casa?",
      nickname: "Giulia",
      status: "on_air",
      created_at: minutesAgo(25),
      on_air_at: minutesAgo(1),
    },
    {
      text: "Come vi è venuta l'idea di aprire un bar qui?",
      nickname: null,
      status: "new",
      created_at: minutesAgo(18),
    },
    { text: LONG_QUESTION, nickname: "Marco", status: "new", created_at: minutesAgo(12) },
    {
      text: "Musica dal vivo anche il sabato? 🎸",
      nickname: "Ale",
      status: "new",
      created_at: minutesAgo(4),
    },
    {
      text: "Avete birre senza glutine?",
      nickname: null,
      status: "new",
      created_at: minutesAgo(1),
    },
    {
      text: "Da quanti anni siete aperti?",
      nickname: "Sara",
      status: "read",
      created_at: minutesAgo(40),
      read_at: minutesAgo(30),
    },
    {
      text: "Chi sceglie la playlist?",
      nickname: null,
      status: "read",
      created_at: minutesAgo(35),
      read_at: minutesAgo(20),
    },
  ];
  const { error } = await db.from("questions").insert(rows);
  if (error) throw error;
}

/** Mette in onda la domanda con quel testo (la precedente diventa letta). */
export async function putOnAir(text: string | null) {
  const db = localServiceClient();
  await db.from("questions").update({ status: "read" }).eq("status", "on_air");
  if (text) await db.from("questions").update({ status: "on_air" }).eq("text", text);
}
