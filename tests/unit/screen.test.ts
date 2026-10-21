import { describe, expect, it } from "vitest";
import { fontSizeFor } from "@/lib/screen";

describe("fontSizeFor", () => {
  it("scala il font con la lunghezza (code point)", () => {
    expect(fontSizeFor("a".repeat(60))).toBe("6.25vw");
    expect(fontSizeFor("a".repeat(61))).toBe("5vw");
    expect(fontSizeFor("a".repeat(120))).toBe("5vw");
    expect(fontSizeFor("a".repeat(200))).toBe("3.75vw");
    expect(fontSizeFor("a".repeat(300))).toBe("2.9vw");
    expect(fontSizeFor("🍺".repeat(60))).toBe("6.25vw");
  });
});
