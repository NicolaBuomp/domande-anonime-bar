import { describe, expect, it } from "vitest";
import { containsProfanity, tokenize } from "@/lib/profanity";

describe("containsProfanity: rifiuta", () => {
  it.each([
    "Sei uno stronzo",
    "che cazzo dici",
    "CAAAZZZOOO",
    "càzzo",
    "c4zz0",
    "c a z z o",
    "c.a.z.z.o",
    "m1nch!a",
    "vaffanculo gestore",
    "che culo!",
    "porco dio",
    "Porcodio",
    "Dio cane!",
    "porca madonna",
    "sei un fottuto bastardo",
    "rompicoglioni",
    "stronzone",
    "che puttanata",
    "fuck this",
  ])("%s", (text) => {
    expect(containsProfanity(text)).toBe(true);
  });
});

describe("containsProfanity: accetta (niente falsi positivi)", () => {
  it.each([
    "Com'è la configurazione dell'impianto?",
    "Chi ha vinto la scazzottata?",
    "Mi presti la cazzuola?",
    "Bisogna inculcare il rispetto",
    "Mi porti un finocchio gratinato?",
    "Un Negroni sbagliato, grazie",
    "Le foto della serata dove le trovo?",
    "Dio esiste secondo te?",
    "Hai mai visto un porco cinghiale?",
    "Che fico questo posto!",
    "Si gioca a poker con le fiches?",
    "Lo zoccolo duro dei clienti",
    "Chi suona la tromba stasera?",
    "Grazie ai pompieri!",
    "Buon compleanno Marco 🎉",
    "Quanti anni hai? 4 o 5?",
    "Ciao!!!",
    "Che culla carina",
    "Il calcio è uno sport",
  ])("%s", (text) => {
    expect(containsProfanity(text)).toBe(false);
  });
});

describe("tokenize", () => {
  it("decodifica leetspeak, toglie accenti e unisce le lettere isolate", () => {
    expect(tokenize("C4zz0")).toContain("cazzo");
    expect(tokenize("perché")).toContain("perche");
    expect(tokenize("s t r o n z o")).toContain("stronzo");
  });

  it("tratta ! come punteggiatura fuori dalle parole", () => {
    expect(tokenize("ciao!")).toEqual(["ciao"]);
  });
});
