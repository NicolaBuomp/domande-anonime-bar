// Load test leggero (plan S7): 200 invii da 50 "dispositivi" in 2 minuti.
// Ogni dispositivo ha il suo user agent e il suo cookie jar (did).
// Esito: exit 1 se c'è anche un solo 5xx o errore di rete. I 429 sono attesi (spec §9 A5).
//
// Uso:
//   node scripts/loadtest.mjs --url http://localhost:3100 [--check-db] [--reset-db]
//   node scripts/loadtest.mjs --url https://<preview>.vercel.app   (bypass da VERCEL_AUTOMATION_BYPASS_SECRET)
// Opzioni: --devices 50 --requests 200 --duration 120 (secondi)
//   --check-db  (solo locale) verifica che nessun dispositivo abbia due invii accettati < 60 s
//   --reset-db  (solo locale) svuota questions e submit_log prima di partire
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values: opt } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3100" },
    devices: { type: "string", default: "50" },
    requests: { type: "string", default: "200" },
    duration: { type: "string", default: "120" },
    "check-db": { type: "boolean", default: false },
    "reset-db": { type: "boolean", default: false },
  },
});

const DEVICES = Number(opt.devices);
const REQUESTS = Number(opt.requests);
const DURATION_MS = Number(opt.duration) * 1000;
const endpoint = new URL("/api/questions", opt.url).toString();
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(opt.url);

if ((opt["check-db"] || opt["reset-db"]) && !local) {
  console.error("--check-db / --reset-db solo contro un server locale");
  process.exit(1);
}

async function localDb() {
  const { createClient } = await import("@supabase/supabase-js");
  const s = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  return createClient(s.API_URL, s.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const UAS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
];

const QUESTIONS = [
  "Qual è il cocktail della casa?",
  "Fate serate anche il giovedì?",
  "Chi sceglie la musica?",
  "Avete birre artigianali alla spina?",
  "Da quanto siete aperti?",
];

const results = new Map(); // status → count
const bump = (k) => results.set(k, (results.get(k) ?? 0) + 1);
let started = 0;

async function send(device, i) {
  started++;
  const headers = {
    "content-type": "application/json",
    "user-agent": device.ua,
    ...(device.cookie ? { cookie: device.cookie } : {}),
    ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
  };
  const body = JSON.stringify({
    text: `${QUESTIONS[i % QUESTIONS.length]} (#${device.n}-${i})`,
    nickname: i % 3 === 0 ? `Disp ${device.n}` : null,
  });
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const setCookie = res.headers.get("set-cookie");
    const did = setCookie?.match(/did=([^;]+)/)?.[1];
    if (did) device.cookie = `did=${did}`;
    const json = await res.json().catch(() => ({}));
    bump(res.status === 429 ? `429 ${json.error}` : String(res.status));
  } catch (err) {
    bump(`rete: ${err.name}`);
  }
}

if (opt["reset-db"]) {
  const db = await localDb();
  await db.from("questions").delete().not("id", "is", null);
  await db.from("submit_log").delete().gte("id", 0);
}

console.log(
  `→ ${REQUESTS} invii da ${DEVICES} dispositivi in ${DURATION_MS / 1000}s verso ${endpoint}`,
);
const devices = Array.from({ length: DEVICES }, (_, n) => ({
  n,
  ua: UAS[n % UAS.length],
  cookie: null,
}));
const perDevice = Math.ceil(REQUESTS / DEVICES);
const t0 = Date.now();

// ogni dispositivo invia in sequenza (come un telefono vero) a istanti casuali
await Promise.all(
  devices.map(async (device) => {
    const times = Array.from({ length: perDevice }, () => Math.random() * DURATION_MS).sort(
      (a, b) => a - b,
    );
    for (let i = 0; i < times.length && started < REQUESTS; i++) {
      const wait = t0 + times[i] - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      await send(device, i);
    }
  }),
);

const total = [...results.values()].reduce((a, b) => a + b, 0);
console.log(`\nEsiti (${total} richieste in ${((Date.now() - t0) / 1000).toFixed(1)}s):`);
for (const [k, v] of [...results.entries()].sort()) console.log(`  ${k.padEnd(18)} ${v}`);

const bad = [...results.entries()].filter(([k]) => /^5\d\d$/.test(k) || k.startsWith("rete"));
let ok = bad.length === 0;
if (!ok) console.error(`\n✗ ${bad.map(([k, v]) => `${v}× ${k}`).join(", ")}`);

if (opt["check-db"]) {
  const db = await localDb();
  const { data, error } = await db
    .from("submit_log")
    .select("device_hash,created_at")
    .order("created_at");
  if (error) throw error;
  const last = new Map();
  let violations = 0;
  for (const row of data) {
    const t = new Date(row.created_at).getTime();
    const prev = last.get(row.device_hash);
    if (prev !== undefined && t - prev < 59_000) violations++; // created_at troncato al secondo
    last.set(row.device_hash, t);
  }
  const { count } = await db.from("questions").select("*", { count: "exact", head: true });
  const accepted = results.get("201") ?? 0;
  console.log(
    `\nDB: ${count} domande salvate, ${accepted} risposte 201, ${violations} violazioni del cooldown`,
  );
  if (violations > 0 || count !== accepted) ok = false;
}

console.log(ok ? "\n✓ nessun 5xx, nessun errore di rete" : "\n✗ load test FALLITO");
process.exit(ok ? 0 : 1);
