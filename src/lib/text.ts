// Normalizzazione e validazione di domanda e nickname (spec §2.2, punti 3–4).
// Condiviso da client (contatore) e server (validazione vera).

export const MAX_TEXT = 300;
export const MAX_NICKNAME = 30;

const ZWJ = "‍"; // tenuto: unisce le emoji composte (👨‍👩‍👧)

/** Caratteri = code point Unicode, come `char_length` di Postgres. */
export function charCount(s: string): number {
  return [...s].length;
}

/**
 * NFC, spazi/a capo → spazio singolo, via caratteri di controllo e di formato
 * (zero-width, override bidi…), trim.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, (ch) => (ch === ZWJ ? ch : ""))
    .replace(/ {2,}/g, " ")
    .trim();
}

export type ValidationResult =
  | { ok: true; text: string; nickname: string | null }
  | { ok: false; field: "text" | "nickname"; reason: "empty" | "too_long" };

export function validateQuestion(rawText: string, rawNickname: string | null): ValidationResult {
  const text = normalize(rawText);
  if (text.length === 0) return { ok: false, field: "text", reason: "empty" };
  if (charCount(text) > MAX_TEXT) return { ok: false, field: "text", reason: "too_long" };

  const nick = rawNickname == null ? "" : normalize(rawNickname);
  if (charCount(nick) > MAX_NICKNAME) return { ok: false, field: "nickname", reason: "too_long" };

  return { ok: true, text, nickname: nick.length > 0 ? nick : null };
}
