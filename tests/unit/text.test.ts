import { describe, expect, it } from "vitest";
import { charCount, MAX_NICKNAME, MAX_TEXT, normalize, validateQuestion } from "@/lib/text";

describe("normalize", () => {
  it("collassa spazi e a capo e fa trim", () => {
    expect(normalize("  ciao\n\n  come\tstai?  ")).toBe("ciao come stai?");
  });

  it("rimuove caratteri di controllo, zero-width e override bidi", () => {
    expect(normalize("a\u0000b​c‮d﻿")).toBe("abcd");
  });

  it("tiene le emoji composte (ZWJ)", () => {
    const family = "👨‍👩‍👧";
    expect(normalize(` ${family} `)).toBe(family);
  });

  it("normalizza in NFC", () => {
    expect(normalize("perché")).toBe("perché");
  });
});

describe("charCount", () => {
  it("conta i code point, non le unità UTF-16", () => {
    expect(charCount("🍺🍺")).toBe(2);
    expect(charCount("perché")).toBe(6);
  });
});

describe("validateQuestion", () => {
  it("accetta testo valido e nickname vuoto → null", () => {
    expect(validateQuestion("  Che birra c'è?  ", "   ")).toEqual({
      ok: true,
      text: "Che birra c'è?",
      nickname: null,
    });
  });

  it("rifiuta testo vuoto o solo spazi", () => {
    expect(validateQuestion("   \n ", null)).toEqual({ ok: false, field: "text", reason: "empty" });
  });

  it("accetta esattamente 300 caratteri e rifiuta 301", () => {
    expect(validateQuestion("a".repeat(MAX_TEXT), null).ok).toBe(true);
    expect(validateQuestion("a".repeat(MAX_TEXT + 1), null)).toEqual({
      ok: false,
      field: "text",
      reason: "too_long",
    });
  });

  it("conta le emoji come un carattere ciascuna", () => {
    expect(validateQuestion("🍺".repeat(MAX_TEXT), null).ok).toBe(true);
  });

  it("valida il nickname a 30 caratteri", () => {
    expect(validateQuestion("ok", "b".repeat(MAX_NICKNAME))).toMatchObject({ ok: true });
    expect(validateQuestion("ok", "b".repeat(MAX_NICKNAME + 1))).toEqual({
      ok: false,
      field: "nickname",
      reason: "too_long",
    });
  });

  it("misura la lunghezza dopo la normalizzazione", () => {
    expect(validateQuestion(`  ${"a".repeat(MAX_TEXT)}  \n`, null).ok).toBe(true);
  });
});
