"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { t } from "@/lib/strings";
import { MAX_NICKNAME, MAX_TEXT, charCount, normalize } from "@/lib/text";

// Form pubblico (spec §2.1). Parla solo con POST /api/questions.

const DRAFT_KEY = "domande:draft";
const TIMEOUT_MS = 10_000;

type FormError =
  | { kind: "tooLong" | "invalid" | "rejected" | "offline" | "serverError" }
  | { kind: "cooldown" | "busy"; seconds: number }
  | { kind: "dailyLimit" | "closed" };

function messageFor(e: FormError): string {
  switch (e.kind) {
    case "cooldown":
      return t.form.cooldown(e.seconds);
    case "busy":
      return t.form.busy(e.seconds);
    default:
      return t.form[e.kind];
  }
}

function loadDraft(): { text: string; nickname: string } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as { text?: unknown; nickname?: unknown };
      return {
        text: typeof d.text === "string" ? d.text : "",
        nickname: typeof d.nickname === "string" ? d.nickname : "",
      };
    }
  } catch {
    // storage non disponibile (navigazione privata): si va avanti senza bozza
  }
  return { text: "", nickname: "" };
}

function saveDraft(text: string, nickname: string) {
  try {
    if (text || nickname) localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, nickname }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignorato: la bozza è una comodità
  }
}

async function errorFromResponse(res: Response): Promise<FormError> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    reason?: string;
    retryAfter?: number;
  };
  const seconds = Math.max(1, Math.ceil(Number(body.retryAfter) || 60));
  if (res.status === 400) return { kind: body.reason === "too_long" ? "tooLong" : "invalid" };
  if (res.status === 422) return { kind: "rejected" };
  if (res.status === 429 && body.error === "cooldown") return { kind: "cooldown", seconds };
  if (res.status === 429 && body.error === "daily_limit") return { kind: "dailyLimit" };
  if (res.status === 429) return { kind: "busy", seconds };
  if (res.status === 503) return { kind: "closed" };
  return { kind: "serverError" };
}

export function QuestionForm() {
  const [text, setText] = useState("");
  const [nickname, setNickname] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const thanksRef = useRef<HTMLHeadingElement>(null);
  const ids = { text: useId(), nick: useId(), counter: useId(), hint: useId(), error: useId() };

  // bozza: caricata una volta al montaggio, salvata a ogni modifica
  useEffect(() => {
    const d = loadDraft();
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage esiste solo dopo il mount */
    setText(d.text);
    setNickname(d.nickname);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // conto alla rovescia per cooldown / busy
  const countdown = error && "seconds" in error ? error.seconds : 0;
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => {
      setError((e) =>
        e && "seconds" in e ? (e.seconds > 1 ? { ...e, seconds: e.seconds - 1 } : null) : e,
      );
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  useEffect(() => {
    if (sent) thanksRef.current?.focus();
  }, [sent]);

  const textCount = charCount(normalize(text));
  const nickCount = charCount(normalize(nickname));
  const tooLong = textCount > MAX_TEXT || nickCount > MAX_NICKNAME;
  const blocked = error?.kind === "dailyLimit" || error?.kind === "closed" || countdown > 0;
  const canSubmit = textCount > 0 && !tooLong && !sending && !blocked;

  function update(nextText: string, nextNick: string) {
    setText(nextText);
    setNickname(nextNick);
    saveDraft(nextText, nextNick);
    // gli errori legati al contenuto spariscono quando si corregge
    if (
      error &&
      ["tooLong", "invalid", "rejected", "serverError", "offline"].includes(error.kind)
    ) {
      setError(null);
    }
  }

  function fail(e: FormError) {
    setError(e);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const website = String(new FormData(event.currentTarget).get("website") ?? "");

    setSending(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, nickname: nickname || null, website }),
        signal: controller.signal,
      });
      if (res.status === 201) {
        saveDraft("", "");
        setText("");
        setNickname("");
        setSent(true);
      } else {
        fail(await errorFromResponse(res));
      }
    } catch {
      fail({ kind: "offline" });
    } finally {
      clearTimeout(timer);
      setSending(false);
    }
  }

  if (sent) {
    return (
      <section className="flex flex-col items-center gap-6 py-10 text-center" aria-live="polite">
        <h2 ref={thanksRef} tabIndex={-1} className="text-4xl font-bold outline-none">
          {t.thanks.title}
        </h2>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="min-h-12 rounded-xl px-5 text-base font-semibold text-amber-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:text-amber-300"
        >
          {t.thanks.again}
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.text} className="text-base font-semibold">
          {t.form.questionLabel}
        </label>
        <textarea
          id={ids.text}
          name="text"
          rows={5}
          value={text}
          onChange={(e) => update(e.target.value, nickname)}
          placeholder={t.form.questionPlaceholder}
          aria-describedby={`${ids.counter} ${error ? ids.error : ""}`.trim()}
          aria-invalid={textCount > MAX_TEXT || undefined}
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-400"
        />
        <p
          id={ids.counter}
          className={`self-end text-sm tabular-nums ${
            textCount > MAX_TEXT
              ? "font-semibold text-red-700 dark:text-red-400"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          {textCount}/{MAX_TEXT}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.nick} className="text-base font-semibold">
          {t.form.nicknameLabel}
        </label>
        <input
          id={ids.nick}
          name="nickname"
          type="text"
          autoComplete="off"
          value={nickname}
          onChange={(e) => update(text, e.target.value)}
          aria-describedby={ids.hint}
          aria-invalid={nickCount > MAX_NICKNAME || undefined}
          className="min-h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <p id={ids.hint} className="text-sm text-gray-600 dark:text-gray-400">
          {t.form.nicknameHint}{" "}
          <span
            className={`tabular-nums ${nickCount > MAX_NICKNAME ? "font-semibold text-red-700 dark:text-red-400" : ""}`}
          >
            ({nickCount}/{MAX_NICKNAME})
          </span>
        </p>
      </div>

      {/* honeypot: invisibile a persone e screen reader, i bot lo compilano */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div aria-live="polite" className="min-h-6">
        {tooLong && !error ? (
          <p className="text-base font-medium text-red-700 dark:text-red-400">{t.form.tooLong}</p>
        ) : null}
        {error ? (
          <p
            id={ids.error}
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800 outline-none dark:bg-red-950 dark:text-red-200"
          >
            {messageFor(error)}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
        className="min-h-12 rounded-xl bg-amber-500 px-5 text-lg font-bold text-gray-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
      >
        {sending ? t.form.sending : t.form.submit}
      </button>
    </form>
  );
}
