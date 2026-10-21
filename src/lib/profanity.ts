// Filtro parolacce italiano (spec §2.2.1). Restituisce solo un booleano: il messaggio
// all'utente è neutro e non dice quale parola ha fatto scattare il filtro.
//
// Lista conservativa: parolacce volgari, bestemmie, insulti pesanti e termini d'odio.
// Esclusi di proposito gli insulti leggeri ("stupido", "scemo") e le parole ambigue
// ("sega", "finocchio", "fiche", "zoccolo"): sullo schermo va comunque solo ciò che
// sceglie il gestore. Falso positivo noto e accettato: "Troia" (la città).

type Mode = "word" | "prefix";

const TERMS: ReadonlyArray<readonly [string, Mode]> = [
  // radici: colpiscono tutte le forme (cazzo, cazzata, cazzone…)
  ["cazz", "prefix"],
  ["stronz", "prefix"],
  ["coglion", "prefix"],
  ["rompicoglion", "prefix"],
  ["vaffancul", "prefix"],
  ["fancul", "prefix"],
  ["leccacul", "prefix"],
  ["puttan", "prefix"],
  ["sputtan", "prefix"],
  ["mignott", "prefix"],
  ["minchi", "prefix"],
  ["merd", "prefix"],
  ["fott", "prefix"],
  ["incul", "prefix"],
  ["sborr", "prefix"],
  ["pompin", "prefix"],
  ["bocchinar", "prefix"],
  ["fregn", "prefix"],
  ["bastard", "prefix"],
  ["froci", "prefix"],
  ["ricchion", "prefix"],
  ["culatton", "prefix"],
  ["terron", "prefix"],
  ["mongoloid", "prefix"],
  ["fuck", "prefix"],
  // parole intere (le radici darebbero troppi falsi positivi)
  ["culo", "word"],
  ["culi", "word"],
  ["figa", "word"],
  ["fighe", "word"],
  ["fica", "word"],
  ["troia", "word"],
  ["troie", "word"],
  ["zoccola", "word"],
  ["zoccole", "word"],
  ["negro", "word"],
  ["negra", "word"],
  ["negri", "word"],
  ["negre", "word"],
  ["cagare", "word"],
  ["cagata", "word"],
  ["cagate", "word"],
  ["cagato", "word"],
  ["pirla", "word"],
  ["trombare", "word"],
  ["trombata", "word"],
  ["trombato", "word"],
  ["cornuto", "word"],
  ["cornuta", "word"],
  ["shit", "word"],
  ["bitch", "word"],
];

// Bestemmie: coppie di parole, riconosciute sia separate sia attaccate.
const BLASPHEMY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ...["porco", "porca"].flatMap((a) =>
    ["dio", "madonna", "cristo", "gesu"].map((b) => [a, b] as const),
  ),
  ...["dio", "cristo", "madonna", "gesu"].flatMap((a) =>
    ["cane", "porco", "porca", "maiale", "boia", "bestia", "ladro", "merda", "infame"].map(
      (b) => [a, b] as const,
    ),
  ),
];

// Eccezioni note: parole innocue che iniziano come una radice.
const ALLOW_PREFIXES = ["cazzuol", "inculc"];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/**
 * Regex che rispetta le doppie della parola: una lettera singola accetta ripetizioni
 * (a+), una doppia ne richiede almeno due (z{2,}). Così "caaazzzooo" → cazzo, ma
 * "foto" non diventa "fott…".
 */
function termRegex(term: string, mode: Mode): RegExp {
  const runs = term.match(/(.)\1*/g) ?? [];
  const body = runs.map((r) => (r.length >= 2 ? `${r[0]}{2,}` : `${r[0]}+`)).join("");
  return new RegExp(mode === "word" ? `^${body}$` : `^${body}`);
}

const TERM_RES = TERMS.map(([term, mode]) => termRegex(term, mode));
const PAIR_RES = BLASPHEMY_PAIRS.map(
  ([a, b]) => [termRegex(a, "word"), termRegex(b, "word"), termRegex(a + b, "word")] as const,
);

/** Minuscolo, senza accenti, leetspeak decodificato, spezzato in parole. */
export function tokenize(input: string): string[] {
  const s = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // "!" vale "i" solo fra due lettere (m1nch!a), altrimenti è punteggiatura
    .replace(/(?<=\p{L})!(?=\p{L})/gu, "i")
    .replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch);

  const tokens = s.split(/[^\p{L}]+/u).filter(Boolean);

  // "c a z z o", "c.a.z.z.o": tre o più lettere isolate di fila diventano una parola
  const joined: string[] = [];
  let run: string[] = [];
  for (const tok of [...tokens, ""]) {
    if (tok.length === 1) {
      run.push(tok);
      continue;
    }
    if (run.length >= 3) joined.push(run.join(""));
    run = [];
  }
  return [...tokens, ...joined];
}

export function containsProfanity(input: string): boolean {
  const tokens = tokenize(input);

  for (const tok of tokens) {
    if (ALLOW_PREFIXES.some((p) => tok.startsWith(p))) continue;
    if (TERM_RES.some((re) => re.test(tok))) return true;
    if (PAIR_RES.some(([, , both]) => both.test(tok))) return true;
  }

  for (let i = 0; i + 1 < tokens.length; i++) {
    const [a, b] = [tokens[i], tokens[i + 1]];
    if (PAIR_RES.some(([reA, reB]) => reA.test(a) && reB.test(b))) return true;
  }

  return false;
}
