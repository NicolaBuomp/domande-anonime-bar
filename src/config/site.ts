// Dati del locale. Nome e logo sono placeholder finché non arrivano quelli veri (spec B2).
export const site = {
  barName: "Il Bar",
  logoSrc: "/logo.svg",
} as const;

/** URL pubblico di produzione codificato nel QR (mai quello della richiesta corrente). */
export function getSiteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}
