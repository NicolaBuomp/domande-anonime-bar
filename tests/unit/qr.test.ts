import { describe, expect, it } from "vitest";
import { getSiteUrl } from "@/config/site";
import { qrDataUri } from "@/lib/qr";

describe("qrDataUri", () => {
  it("genera un SVG data URI che codifica l'URL", async () => {
    const uri = await qrDataUri("https://domande.example.it");
    expect(uri).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(uri.split(",")[1], "base64").toString("utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
  });

  it("URL diversi → QR diversi", async () => {
    expect(await qrDataUri("https://a.example")).not.toBe(await qrDataUri("https://b.example"));
  });
});

describe("getSiteUrl", () => {
  it("toglie la barra finale e restituisce null se manca", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://domande.example.it/";
    expect(getSiteUrl()).toBe("https://domande.example.it");
    process.env.NEXT_PUBLIC_SITE_URL = "  ";
    expect(getSiteUrl()).toBeNull();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBeNull();
    if (prev !== undefined) process.env.NEXT_PUBLIC_SITE_URL = prev;
  });
});
