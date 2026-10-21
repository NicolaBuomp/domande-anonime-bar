"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/strings";
import type { Question } from "./types";

const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

export function relativeTime(iso: string, now: number): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return "adesso";
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  return rtf.format(-Math.round(s / 3600), "hour");
}

const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-wait disabled:opacity-60";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const ICON = {
  onAir: "M8 5v14l11-7z",
  read: "M5 12.5l4.5 4.5L19 7.5",
  delete: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};

type Props = {
  q: Question;
  now: number;
  busy: boolean;
  fresh?: boolean;
  variant: "onAir" | "new" | "read";
  onGoOnAir?: () => void;
  onMarkRead?: () => void;
  onDelete: () => void;
};

export function QuestionCard({
  q,
  now,
  busy,
  fresh,
  variant,
  onGoOnAir,
  onMarkRead,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  // conferma in due tempi: "Elimina" → "Sicuro?" per 3 secondi
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  const onAir = variant === "onAir";
  return (
    <article
      className={[
        "flex flex-col gap-3 rounded-2xl border p-4 transition-colors duration-700",
        onAir
          ? "border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/60"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900",
        fresh ? "ring-4 ring-amber-300 dark:ring-amber-600" : "",
        variant === "read" ? "opacity-80" : "",
      ].join(" ")}
    >
      <p
        className={`whitespace-pre-wrap break-words ${onAir ? "text-xl font-semibold" : "text-lg"}`}
      >
        {q.text}
      </p>
      {/* Elimina sta qui, lontano dalle azioni principali: meno tap sbagliati, una riga in meno */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium">{q.nickname ?? t.admin.anonymous}</span>
          {" · "}
          <time dateTime={q.created_at}>{relativeTime(q.created_at, now)}</time>
        </p>
        <button
          type="button"
          onClick={() => (confirming ? (setConfirming(false), onDelete()) : setConfirming(true))}
          disabled={busy}
          aria-live="polite"
          className={`${btn} -mr-2 shrink-0 px-3 ${
            confirming
              ? "bg-red-700 text-white hover:bg-red-600"
              : "text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          }`}
        >
          <Icon d={ICON.delete} />
          {confirming ? t.admin.confirmDelete : t.admin.delete}
        </button>
      </div>
      {variant === "read" ? null : (
        <div className="flex flex-wrap gap-2">
          {variant === "new" && onGoOnAir ? (
            <button
              type="button"
              onClick={onGoOnAir}
              disabled={busy}
              className={`${btn} bg-amber-500 text-gray-950 hover:bg-amber-400`}
            >
              <Icon d={ICON.onAir} />
              {t.admin.goOnAir}
            </button>
          ) : null}
          {onMarkRead ? (
            <button
              type="button"
              onClick={onMarkRead}
              disabled={busy}
              className={`${btn} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700`}
            >
              <Icon d={ICON.read} />
              {t.admin.markRead}
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}
