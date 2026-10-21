"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { site } from "@/config/site";
import { t } from "@/lib/strings";
import { getBrowserClient } from "@/lib/supabase/browser";
import { fontSizeFor } from "@/lib/screen";

// Vista proiettata (spec §2.6): legge solo screen_state, mai questions.

type OnScreen = { text: string; nickname: string | null } | null;
const POLL_MS = 30_000;
const OFFLINE_AFTER_MS = 10_000;
const CURSOR_HIDE_MS = 3_000;

export function ScreenView({ siteUrl }: { siteUrl: string | null }) {
  const [current, setCurrent] = useState<OnScreen>(null);
  const [connected, setConnected] = useState(true);
  const [showOffline, setShowOffline] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);

  const refetch = useCallback(async () => {
    // client creato solo nel browser: la pagina è prerenderizzata in build, senza env
    const { data, error } = await getBrowserClient()
      .from("screen_state")
      .select("text,nickname")
      .eq("id", 1)
      .single();
    if (error) return; // si tiene l'ultima domanda: meglio che uno schermo vuoto
    setCurrent(data.text ? { text: data.text, nickname: data.nickname } : null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primo caricamento dal DB
    void refetch();
    const supabase = getBrowserClient();
    const channel = supabase
      .channel("screen", { config: { postgres_changes_options: { wait: true } } })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "screen_state" },
        (payload) => {
          const row = payload.new as { text: string | null; nickname: string | null };
          setCurrent(row.text ? { text: row.text, nickname: row.nickname } : null);
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void refetch();
      });
    const poll = setInterval(() => void refetch(), POLL_MS);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  // indicatore discreto solo dopo 10 s di disconnessione
  useEffect(() => {
    if (connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset immediato al ritorno della rete
      setShowOffline(false);
      return;
    }
    const id = setTimeout(() => setShowOffline(true), OFFLINE_AFTER_MS);
    return () => clearTimeout(id);
  }, [connected]);

  // schermo sempre acceso (se supportato) e cursore nascosto quando è fermo
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // non supportato o negato: va bene comunque
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);

    let timer = setTimeout(() => setCursorHidden(true), CURSOR_HIDE_MS);
    const onMove = () => {
      setCursorHidden(false);
      clearTimeout(timer);
      timer = setTimeout(() => setCursorHidden(true), CURSOR_HIDE_MS);
    };
    window.addEventListener("mousemove", onMove);

    return () => {
      document.removeEventListener("visibilitychange", acquire);
      window.removeEventListener("mousemove", onMove);
      clearTimeout(timer);
      void lock?.release().catch(() => {});
    };
  }, []);

  const shortUrl = siteUrl?.replace(/^https?:\/\//, "");

  return (
    <main
      className={`fixed inset-0 flex flex-col overflow-hidden bg-black text-white ${cursorHidden ? "cursor-none" : ""}`}
      data-conn={connected ? "live" : "down"}
    >
      {/* logo d'angolo solo quando c'è una domanda: in attesa il logo è già al centro */}
      {current ? (
        <Image
          src={site.logoSrc}
          alt={site.barName}
          width={96}
          height={96}
          unoptimized
          className="absolute top-[3vh] left-[3vw] h-[6vh] w-auto opacity-90"
        />
      ) : null}

      <div
        className="flex flex-1 items-center justify-center px-[8vw] py-[10vh]"
        aria-live="polite"
      >
        {current ? (
          <figure key={current.text} className="screen-fade flex max-w-full flex-col gap-[3vh]">
            <blockquote
              className="font-bold leading-[1.2] break-words whitespace-pre-wrap"
              style={{ fontSize: fontSizeFor(current.text) }}
            >
              {current.text}
            </blockquote>
            {current.nickname ? (
              <figcaption className="text-[2.6vw] font-medium text-amber-300">
                — {current.nickname}
              </figcaption>
            ) : null}
          </figure>
        ) : (
          <div className="screen-fade flex flex-col items-center gap-[4vh] text-center">
            <Image
              src={site.logoSrc}
              alt=""
              width={240}
              height={240}
              unoptimized
              className="h-[22vh] w-auto"
            />
            <h1 className="text-[5.5vw] leading-tight font-bold">{t.screen.idleTitle}</h1>
            <p className="text-[2.8vw] text-gray-200">{t.screen.idleBody}</p>
            {shortUrl ? (
              <p className="text-[2.4vw] font-semibold text-amber-300">{shortUrl}</p>
            ) : null}
          </div>
        )}
      </div>

      {showOffline ? (
        <p className="absolute right-[2vw] bottom-[2vh] rounded-full bg-gray-800 px-4 py-2 text-[1.1vw] text-gray-200">
          {t.screen.reconnecting}
        </p>
      ) : null}
    </main>
  );
}
