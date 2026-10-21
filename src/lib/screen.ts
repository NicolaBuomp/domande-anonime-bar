import { charCount } from "@/lib/text";

/** Font di /screen a scaglioni in vw: 300 caratteri stanno a 1920×1080 senza scroll. */
export function fontSizeFor(text: string): string {
  const n = charCount(text);
  if (n <= 60) return "6.25vw";
  if (n <= 120) return "5vw";
  if (n <= 200) return "3.75vw";
  return "2.9vw";
}
