"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/config/site";
import { t } from "@/lib/strings";
import { getBrowserClient } from "@/lib/supabase/browser";
import { QuestionCard } from "./QuestionCard";
import { QUESTION_COLUMNS, type Question } from "./types";

// Lista live del gestore (spec §2.4). Realtime + rete di sicurezza:
// refetch completo a ogni (ri)sottoscrizione e al ritorno in primo piano,
// polling ogni 20 s finché il canale non è attivo e ogni 60 s anche quando lo è,
// così un guasto silenzioso di Realtime dura al massimo un minuto (plan §8.2, §13).

type Conn = "connecting" | "live" | "reconnecting" | "offline";
const POLL_MS = 20_000;
const HEARTBEAT_MS = 60_000;
const FRESH_MS = 2_000;

/** Errori che indicano una sessione non più valida (JWT scaduto / revocato). */
function isAuthError(status: number | undefined, code: string | undefined) {
  return status === 401 || code === "PGRST301" || code === "PGRST302" || code === "PGRST303";
}

export function AdminBoard() {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [questions, setQuestions] = useState<Map<string, Question>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [conn, setConn] = useState<Conn>("connecting");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const loggingOut = useRef(false);
  const router = useRouter();

  const refetch = useCallback(async () => {
    const { data, error, status } = await supabase
      .from("questions")
      .select(QUESTION_COLUMNS)
      // le 500 più recenti (spec A8): con più righe si perdono le vecchie, mai le nuove
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      if (isAuthError(status, error.code)) setSessionExpired(true);
      return;
    }
    setQuestions(new Map(data.map((q) => [q.id, q])));
    setLoaded(true);
  }, [supabase]);

  const markFresh = useCallback((id: string) => {
    setFresh((s) => new Set(s).add(id));
    setTimeout(() => {
      setFresh((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, FRESH_MS);
  }, []);

  // canale Realtime
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primo caricamento dal DB
    void refetch();
    const channel = supabase
      // wait: SUBSCRIBED solo quando lo stream delle modifiche è davvero attivo,
      // non appena il canale si collega (altrimenti "Live" mente e si perdono eventi)
      .channel("admin-questions", { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as Partial<Question>).id;
          if (!id) return;
          setQuestions((m) => {
            const n = new Map(m);
            n.delete(id);
            return n;
          });
          return;
        }
        const q = payload.new as Question;
        setQuestions((m) => new Map(m).set(q.id, q));
        if (payload.eventType === "INSERT") {
          markFresh(q.id);
          setAnnouncement(t.admin.announceNew(q.text));
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConn("live");
          void refetch(); // recupera ciò che è arrivato mentre il canale era giù
        } else {
          setConn(navigator.onLine ? "reconnecting" : "offline");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refetch, markFresh]);

  // polling di fallback (fitto se Realtime è giù, battito lento se è su)
  useEffect(() => {
    const id = setInterval(() => void refetch(), conn === "live" ? HEARTBEAT_MS : POLL_MS);
    return () => clearInterval(id);
  }, [conn, refetch]);

  // rete, primo piano, sessione
  useEffect(() => {
    const onOffline = () => setConn("offline");
    const onOnline = () => {
      setConn("reconnecting");
      void refetch();
    };
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const { error } = await supabase.auth.getUser();
      if (error && !loggingOut.current) setSessionExpired(true);
      void refetch();
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !loggingOut.current) setSessionExpired(true);
    });
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, refetch]);

  // orari relativi
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const {
    onAir,
    fresh: newOnes,
    read,
  } = useMemo(() => {
    const all = [...questions.values()];
    return {
      onAir: all.find((q) => q.status === "on_air") ?? null,
      fresh: all
        .filter((q) => q.status === "new")
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      read: all
        .filter((q) => q.status === "read")
        .sort((a, b) => (b.read_at ?? "").localeCompare(a.read_at ?? "")),
    };
  }, [questions]);

  useEffect(() => {
    document.title = newOnes.length > 0 ? `(${newOnes.length}) ${t.admin.title}` : t.admin.title;
  }, [newOnes.length]);

  async function act(
    id: string,
    run: () => PromiseLike<{ error: { code?: string } | null; status: number }>,
  ) {
    setPending((s) => new Set(s).add(id));
    const { error, status } = await run();
    setPending((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    if (error) {
      if (isAuthError(status, error.code)) setSessionExpired(true);
      else setToast(t.admin.actionError);
    }
    await refetch(); // lo stato vero arriva dal DB anche se Realtime è giù
  }

  const goOnAir = (id: string) => act(id, () => supabase.rpc("go_on_air", { p_id: id }));
  const markRead = (id: string) => act(id, () => supabase.rpc("mark_read", { p_id: id }));
  const remove = (id: string) => act(id, () => supabase.from("questions").delete().eq("id", id));

  async function logout() {
    loggingOut.current = true;
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  const conns: Record<Conn, { label: string; dot: string }> = {
    live: { label: t.admin.live, dot: "bg-green-600" },
    connecting: { label: t.admin.reconnecting, dot: "bg-amber-500" },
    reconnecting: { label: t.admin.reconnecting, dot: "bg-amber-500" },
    offline: { label: t.admin.offline, dot: "bg-red-600" },
  };
  const c = conns[conn];
  const navLink =
    "inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-muted hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink";
  // righe divise da un filo, nessuna card a griglia: altezze diverse non lasciano buchi
  const list = "divide-y divide-line overflow-hidden rounded-2xl border border-line";
  const empty = "rounded-2xl border border-dashed border-control px-4 py-4 text-muted";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-12">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-4">
        <Image src={site.logoSrc} alt="" width={36} height={36} unoptimized />
        <div className="mr-auto flex items-baseline gap-2">
          <h1 className="text-2xl font-bold tracking-[-0.01em]">{t.admin.title}</h1>
          <span className="hidden text-sm text-muted sm:inline">{site.barName}</span>
        </div>
        <p
          className="flex items-center gap-2 text-sm font-medium"
          role="status"
          data-testid="conn-status"
          data-conn={conn}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.dot}`} aria-hidden="true" />
          <span className={conn === "offline" ? "max-w-48 sm:max-w-none" : ""}>{c.label}</span>
        </p>
        <nav className="-mx-3 flex w-full items-center sm:mx-0 sm:w-auto">
          <a href="/admin/qr" className={navLink}>
            {t.admin.linkQr}
          </a>
          <a href="/screen" target="_blank" rel="noopener" className={navLink}>
            {t.admin.linkScreen}
          </a>
          <button type="button" onClick={logout} className={`${navLink} ml-auto sm:ml-0`}>
            {t.admin.logout}
          </button>
        </nav>
      </header>

      {sessionExpired ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-red-900 dark:bg-red-950 dark:text-red-100"
        >
          <p className="font-semibold">{t.admin.sessionExpired}</p>
          <a href="/admin/login?next=/admin" className="btn bg-red-700 text-white">
            {t.admin.loginAgain}
          </a>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* fissa in alto e opaca: la domanda in onda resta sempre sotto il pollice */}
      <section
        aria-labelledby="on-air-title"
        className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-ground px-4 py-3"
      >
        <h2 id="on-air-title" className="flex items-center gap-2 text-base font-semibold">
          {/* la spia "in onda": accesa solo quando c'è qualcosa sullo schermo */}
          <span
            aria-hidden="true"
            className={`inline-block h-3 w-3 rounded-full ${
              onAir ? "bg-air shadow-[0_0_0_4px_var(--air-pale)]" : "border-2 border-control"
            }`}
          />
          {t.admin.onAir}
        </h2>
        {onAir ? (
          <div className="overflow-hidden rounded-2xl border border-line border-l-[6px] border-l-air">
            <QuestionCard
              q={onAir}
              now={now}
              busy={pending.has(onAir.id)}
              variant="onAir"
              onMarkRead={() => markRead(onAir.id)}
              onDelete={() => remove(onAir.id)}
            />
          </div>
        ) : (
          <p className={empty}>{t.admin.noOnAir}</p>
        )}
      </section>

      <section aria-labelledby="new-title" className="flex flex-col gap-3">
        <h2 id="new-title" className="text-base font-semibold">
          {t.admin.new} ({newOnes.length})
        </h2>
        {!loaded ? null : questions.size === 0 ? (
          <p className={empty}>{t.admin.emptyAll}</p>
        ) : newOnes.length === 0 ? (
          <p className={empty}>{t.admin.emptyNew}</p>
        ) : (
          <div className={list}>
            {newOnes.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                now={now}
                busy={pending.has(q.id)}
                fresh={fresh.has(q.id)}
                variant="new"
                onGoOnAir={() => goOnAir(q.id)}
                onMarkRead={() => markRead(q.id)}
                onDelete={() => remove(q.id)}
              />
            ))}
          </div>
        )}
      </section>

      {read.length > 0 ? (
        <details className="group flex flex-col">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-base font-semibold [&::-webkit-details-marker]:hidden">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
              className="shrink-0 text-muted transition-transform group-open:rotate-90"
            >
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" />
            </svg>
            {t.admin.read} ({read.length})
          </summary>
          <div className={`mt-3 ${list}`}>
            {read.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                now={now}
                busy={pending.has(q.id)}
                variant="read"
                onDelete={() => remove(q.id)}
              />
            ))}
          </div>
        </details>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-md rounded-full bg-primary px-5 py-3 text-center font-medium text-on-primary shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
