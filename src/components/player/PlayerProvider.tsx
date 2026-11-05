"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BookAudio } from "@/lib/book";

export type Note = { id: string; chapter_id: string; position_seconds: number; body: string; created_at: string };
type Sleep = { mode: "off" } | { mode: "minutes"; endsAt: number } | { mode: "chapter" };

type PlayerState = {
  book: BookAudio | null;
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  rate: number;
  sleep: Sleep;
  expanded: boolean;
  cta: string | null;
  notes: Note[];
  error: string | null;
};
type PlayerApi = PlayerState & {
  load: (book: BookAudio, index: number, position?: number, autoplay?: boolean) => void;
  toggle: () => void;
  seek: (t: number) => void;
  skip: (s: number) => void;
  goChapter: (i: number) => void;
  setRate: (r: number) => void;
  setSleep: (mode: "off" | "chapter" | number) => void;
  setExpanded: (v: boolean) => void;
  addNote: (body: string, at?: number) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  dismissCta: () => void;
  canPlay: (i: number) => boolean;
};

const Ctx = createContext<PlayerApi | null>(null);
export const usePlayer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlayer must be used inside PlayerProvider");
  return c;
};

export const RATES = [0.75, 1, 1.15, 1.25, 1.5, 1.75, 2, 2.5];
const pad = (n: number) => String(n).padStart(2, "0");
const track = (tag: string, titleId?: string) =>
  fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag, titleId }), keepalive: true }).catch(() => {});

/** Audible-style player that lives in the library layout, so audio keeps playing across pages. */
export function PlayerProvider({ userId, resume, children }: { userId: string; resume?: { book: BookAudio; index: number; position: number } | null; children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const [s, set] = useState<PlayerState>({ book: null, index: 0, playing: false, position: 0, duration: 0, rate: 1, sleep: { mode: "off" }, expanded: false, cta: null, notes: [], error: null });
  const st = useRef(s);
  st.current = s;
  const lastSaved = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const autoplay = useRef(false);

  const canPlay = useCallback((i: number) => {
    const b = st.current.book;
    return !!b && !!b.chapters[i]?.hasAudio && (b.owned || i === 0);
  }, []);

  /* ---- persistence ---- */
  const save = useCallback(async (force = false) => {
    const { book, index, position, rate } = st.current;
    const a = audio.current;
    if (!book || !a) return;
    const now = Date.now();
    if (!force && now - lastSaved.current < 10000) return;
    lastSaved.current = now;
    await supabase.from("audio_progress").upsert({
      user_id: userId, title_id: book.titleId, chapter_id: book.chapters[index].id,
      position_seconds: Math.floor(a.currentTime || position), playback_rate: rate, updated_at: new Date().toISOString(),
    });
  }, [supabase, userId]);

  /* ---- loading ---- */
  const load = useCallback((book: BookAudio, index: number, position = 0, play = true) => {
    const a = audio.current;
    if (!a) return;
    const ch = book.chapters[index];
    if (!ch) return;
    if (!ch.hasAudio) return set((p) => ({ ...p, error: "This chapter's audio is coming soon." }));
    if (!book.owned && index !== 0) return set((p) => ({ ...p, error: "Unlock the book to keep listening." }));
    const sameBook = st.current.book?.titleId === book.titleId;
    if (st.current.book && st.current.playing) save(true);
    pendingSeek.current = position;
    autoplay.current = play;
    a.src = `/api/media/chapter/${ch.id}`;
    a.playbackRate = st.current.rate;
    set((p) => ({ ...p, book, index, position, duration: ch.duration, cta: null, error: null, notes: sameBook ? p.notes : [] }));
    if (!sameBook) {
      supabase.from("notes").select("id, chapter_id, position_seconds, body, created_at").eq("user_id", userId).in("chapter_id", book.chapters.map((c) => c.id)).order("position_seconds")
        .then(({ data }) => set((p) => ({ ...p, notes: (data ?? []).map((n) => ({ ...n, position_seconds: Number(n.position_seconds) })) })));
      supabase.from("audio_progress").select("chapter_id").eq("user_id", userId).eq("title_id", book.titleId).maybeSingle()
        .then(({ data }) => { if (!data) track(`aa-${book.slug}-started`, book.titleId); });
    }
    try { localStorage.setItem("aa-last-book", book.slug); } catch {}
  }, [save, supabase, userId]);

  /* ---- audio element events ---- */
  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    audio.current = a;
    const onMeta = () => {
      if (pendingSeek.current != null) { a.currentTime = Math.min(pendingSeek.current, Math.max(0, (a.duration || 1) - 1)); pendingSeek.current = null; }
      set((p) => ({ ...p, duration: Number.isFinite(a.duration) ? a.duration : p.duration }));
      if (autoplay.current) a.play().catch(() => set((p) => ({ ...p, playing: false })));
    };
    const onTime = () => {
      set((p) => (Math.abs(p.position - a.currentTime) >= 0.25 ? { ...p, position: a.currentTime } : p));
      const sl = st.current.sleep;
      if (sl.mode === "minutes" && Date.now() >= sl.endsAt) { a.pause(); set((p) => ({ ...p, sleep: { mode: "off" } })); }
      save();
    };
    const onPlay = () => set((p) => ({ ...p, playing: true }));
    const onPause = () => { set((p) => ({ ...p, playing: false })); save(true); };
    const onError = () => { if (a.src) set((p) => ({ ...p, playing: false, error: "Couldn't load this chapter. Check your connection and press play again." })); };
    const onEnded = async () => {
      const { book, index, sleep } = st.current;
      if (!book) return;
      const ch = book.chapters[index];
      await supabase.from("chapter_completions").upsert({ user_id: userId, chapter_id: ch.id }, { onConflict: "user_id,chapter_id", ignoreDuplicates: true });
      track(`aa-${book.slug}-ch${pad(ch.position)}-complete`, book.titleId);
      const last = index === book.chapters.length - 1;
      if (last && book.owned) track(`aa-${book.slug}-audiobook-finished`, book.titleId);
      if (!book.owned && index === 0) track(`aa-${book.slug}-sample-finished`, book.titleId);
      set((p) => ({ ...p, cta: book.owned ? ch.cta : "unlock" }));
      const next = index + 1;
      const nextOk = next < book.chapters.length && book.chapters[next].hasAudio && book.owned;
      if (sleep.mode === "chapter") { set((p) => ({ ...p, sleep: { mode: "off" } })); if (nextOk) load(book, next, 0, false); return; }
      if (nextOk) load(book, next, 0, true);
      else save(true);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    const onHide = () => { if (document.visibilityState === "hidden") save(true); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      a.pause();
      a.removeAttribute("src");
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [load, save, supabase, userId]);

  /* ---- restore the last book, paused ---- */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !resume || st.current.book) return;
    restored.current = true;
    load(resume.book, resume.index, resume.position, false);
  }, [resume, load]);

  /* ---- controls ---- */
  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a || !st.current.book) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, []);
  const seek = useCallback((t: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(t, (a.duration || st.current.duration) - 0.5));
    set((p) => ({ ...p, position: a.currentTime }));
    save(true);
  }, [save]);
  const skip = useCallback((d: number) => seek((audio.current?.currentTime ?? 0) + d), [seek]);
  const goChapter = useCallback((i: number) => { const b = st.current.book; if (b) load(b, i, 0, true); }, [load]);
  const setRate = useCallback((r: number) => { if (audio.current) audio.current.playbackRate = r; set((p) => ({ ...p, rate: r })); }, []);
  const setSleep = useCallback((m: "off" | "chapter" | number) => {
    set((p) => ({ ...p, sleep: m === "off" ? { mode: "off" } : m === "chapter" ? { mode: "chapter" } : { mode: "minutes", endsAt: Date.now() + m * 60000 } }));
  }, []);
  const addNote = useCallback(async (body: string, at?: number) => {
    const { book, index } = st.current;
    if (!book || !body.trim()) return;
    const pos = Math.floor(at ?? audio.current?.currentTime ?? 0);
    const { data } = await supabase.from("notes").insert({ user_id: userId, chapter_id: book.chapters[index].id, position_seconds: pos, body: body.trim() }).select("id, chapter_id, position_seconds, body, created_at").single();
    if (data) set((p) => ({ ...p, notes: [...p.notes, { ...data, position_seconds: Number(data.position_seconds) }].sort((x, y) => x.position_seconds - y.position_seconds) }));
  }, [supabase, userId]);
  const deleteNote = useCallback(async (id: string) => {
    await supabase.from("notes").delete().eq("id", id);
    set((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== id) }));
  }, [supabase]);

  /* ---- lock-screen / headphone controls ---- */
  useEffect(() => {
    const b = s.book;
    if (!b || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: b.chapters[s.index]?.name ?? b.title, artist: "Terrance McMahon", album: b.title,
      artwork: [{ src: new URL(b.cover, location.href).href, sizes: "512x768", type: "image/jpeg" }],
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", toggle);
    ms.setActionHandler("pause", toggle);
    ms.setActionHandler("seekbackward", () => skip(-15));
    ms.setActionHandler("seekforward", () => skip(30));
    ms.setActionHandler("previoustrack", () => s.index > 0 && goChapter(s.index - 1));
    ms.setActionHandler("nexttrack", () => canPlay(s.index + 1) && goChapter(s.index + 1));
  }, [s.book, s.index, toggle, skip, goChapter, canPlay]);

  /* ---- keyboard: space play/pause, ←/→ skip ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!st.current.book || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === " ") { e.preventDefault(); toggle(); }
      if (e.key === "ArrowLeft") skip(-15);
      if (e.key === "ArrowRight") skip(30);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip]);

  const api: PlayerApi = {
    ...s, load, toggle, seek, skip, goChapter, setRate, setSleep,
    setExpanded: (v) => set((p) => ({ ...p, expanded: v })),
    addNote, deleteNote, dismissCta: () => set((p) => ({ ...p, cta: null })), canPlay,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
