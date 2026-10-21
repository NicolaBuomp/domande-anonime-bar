import QRCode from "qrcode";

/**
 * QR del form pubblico come data URI SVG (reso con <img>, niente HTML iniettato).
 * Correzione d'errore M e margine di 4 moduli: leggibile anche stampato su carta normale.
 */
export async function qrDataUri(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
