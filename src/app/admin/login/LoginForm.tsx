"use client";

import { useState, type FormEvent } from "react";
import { t } from "@/lib/strings";
import { getBrowserClient } from "@/lib/supabase/browser";

const inputClass =
  "min-h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

export function LoginForm({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFailed(false);
    const { error } = await getBrowserClient().auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (error) {
      setFailed(true);
      setBusy(false);
      return;
    }
    // navigazione completa: proxy e server vedono subito i cookie di sessione
    window.location.assign(next);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="font-semibold">
          {t.login.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="font-semibold">
          {t.login.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <div aria-live="polite" className="min-h-6">
        {failed ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 font-medium text-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {t.login.error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="min-h-12 rounded-xl bg-amber-500 px-5 text-lg font-bold text-gray-950 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-60"
      >
        {t.login.submit}
      </button>
    </form>
  );
}
