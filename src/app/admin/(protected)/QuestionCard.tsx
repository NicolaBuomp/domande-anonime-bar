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

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
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
        "flex flex-col gap-3 px-4 py-4 transition-colors duration-700 sm:flex-row sm:items-center sm:gap-6",
        onAir ? "py-5" : "",
        fresh ? "bg-air-pale" : "",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className={`break-words whitespace-pre-wrap ${
            onAir ? "text-[1.375rem] leading-snug font-semibold" : "text-lg leading-snug"
          } ${variant === "read" ? "text-muted" : ""}`}
        >
          {q.text}
        </p>
        {/* Elimina sta qui, lontano dalle azioni principali: meno tap sbagliati, una riga in meno */}
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">{q.nickname ?? t.admin.anonymous}</span>
            {" · "}
            <time dateTime={q.created_at}>{relativeTime(q.created_at, now)}</time>
          </p>
          <button
            type="button"
            onClick={() => (confirming ? (setConfirming(false), onDelete()) : setConfirming(true))}
            disabled={busy}
            aria-live="polite"
            className={`ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60 sm:ml-0 ${
              confirming ? "bg-danger text-on-primary" : "text-danger hover:bg-raised"
            }`}
          >
            <Icon d={ICON.delete} />
            {confirming ? t.admin.confirmDelete : t.admin.delete}
          </button>
        </div>
      </div>
      {variant === "read" ? null : (
        <div className="flex shrink-0 gap-2">
          {variant === "new" && onGoOnAir ? (
            <button
              type="button"
              onClick={onGoOnAir}
              disabled={busy}
              className="btn-primary flex-1 disabled:cursor-wait sm:flex-none"
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
              className="btn-secondary disabled:cursor-wait"
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
