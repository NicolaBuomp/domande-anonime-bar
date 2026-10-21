// Dati del locale (spec B2).
export const site = {
  barName: "Chapeau Coffee",
  logoSrc: "/logo.png",
} as const;

/** URL pubblico di produzione codificato nel QR (mai quello della richiesta corrente). */
export function getSiteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}
