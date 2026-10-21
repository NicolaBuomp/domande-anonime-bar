import type { Metadata } from "next";
import Image from "next/image";
import { getSiteUrl, site } from "@/config/site";
import { qrDataUri } from "@/lib/qr";
import { t } from "@/lib/strings";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: `QR · ${site.barName}` };

// Foglio A4 da stampare (spec §2.5). L'URL è sempre quello di produzione
// (NEXT_PUBLIC_SITE_URL), mai quello della richiesta: un QR stampato da una
// preview non deve puntare alla preview.
export default async function QrPage() {
  const url = getSiteUrl();
  const qr = url ? await qrDataUri(url) : null;

  return (
    <main className="qr-page flex flex-1 flex-col items-center gap-6 bg-raised px-4 py-6 print:bg-white print:p-0">
      <div className="flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <a
          href="/admin"
          className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold hover:bg-raised"
        >
          ← {t.admin.title}
        </a>
        {qr ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            URL nel QR: <span className="font-mono font-semibold">{url}</span>
          </p>
        ) : null}
        {qr ? <PrintButton /> : null}
      </div>

      {qr ? (
        <article className="qr-sheet flex aspect-[210/297] w-full max-w-[210mm] flex-col items-center justify-center gap-[3%] bg-white p-[8%] text-center text-gray-950 shadow-lg print:shadow-none">
          <Image
            src={site.logoSrc}
            alt={site.barName}
            width={160}
            height={160}
            unoptimized
            className="h-auto w-[22%]"
          />
          <p className="text-[clamp(1rem,3vw,1.75rem)] font-semibold">{site.barName}</p>
          <h1 className="text-[clamp(1.75rem,6vw,3.25rem)] leading-tight font-extrabold">
            {t.qr.title}
          </h1>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI SVG generato al volo */}
          <img src={qr} alt={`QR code: ${url}`} className="qr-code aspect-square w-[60%]" />
          <p className="font-mono text-[clamp(1rem,3vw,1.6rem)] font-bold break-all">
            {url?.replace(/^https?:\/\//, "")}
          </p>
          <p className="text-[clamp(0.9rem,2.4vw,1.25rem)] text-gray-700">{t.qr.subtitle}</p>
        </article>
      ) : (
        <p
          role="alert"
          className="max-w-md rounded-xl bg-red-50 px-4 py-3 font-medium text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {t.qr.missingUrl}
        </p>
      )}
    </main>
  );
}
