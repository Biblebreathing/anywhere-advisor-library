"use client";

import { useEffect, useState } from "react";
import { RATES, usePlayer } from "./PlayerProvider";

export const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};
export const chLabel = (p: number) => (p === 0 ? "Introduction" : `Chapter ${p}`);

const Icon = {
  play: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>,
  pause: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>,
  back: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></svg>,
  fwd: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4h-4" /></svg>,
  prev: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>,
  next: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>,
};

export function PlayPauseIcon({ playing }: { playing: boolean }) {
  return playing ? Icon.pause : Icon.play;
}

/** The bar pinned to the bottom of every library page while something is loaded. */
export function MiniPlayer() {
  const p = usePlayer();
  if (!p.book) return null;
  const ch = p.book.chapters[p.index];
  return (
    <>
      <div className="mini" role="region" aria-label="Now playing">
        <div className="mini-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.book.cover} alt="" />
          <button type="button" className="mini-open" onClick={() => p.setExpanded(true)} aria-label="Open player">
            <span className="ti">{ch?.name}</span>
            <span className="ct">{p.book.title} · <span className="mono">{clock(p.position)} / {clock(p.duration)}</span>{p.rate !== 1 ? ` · ${p.rate}×` : ""}{p.sleep.mode !== "off" ? " · sleep on" : ""}</span>
          </button>
          <button type="button" className="ic hide-sm" onClick={() => p.skip(-15)} aria-label="Back 15 seconds">{Icon.back}<small>15</small></button>
          <button type="button" className="pp" onClick={p.toggle} aria-label={p.playing ? "Pause" : "Play"}><PlayPauseIcon playing={p.playing} /></button>
          <button type="button" className="ic hide-sm" onClick={() => p.skip(30)} aria-label="Forward 30 seconds">{Icon.fwd}<small>30</small></button>
          <span className="mini-bar"><i style={{ width: `${p.duration ? (p.position / p.duration) * 100 : 0}%` }} /></span>
        </div>
      </div>
      {p.expanded && <FullPlayer />}
    </>
  );
}

function FullPlayer() {
  const p = usePlayer();
  const [tab, setTab] = useState<"chapters" | "notes">("chapters");
  const [draft, setDraft] = useState<{ at: number; text: string } | null>(null);
  const [sleepLeft, setSleepLeft] = useState("");
  const b = p.book!;
  const ch = b.chapters[p.index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);
  useEffect(() => {
    if (p.sleep.mode !== "minutes") return setSleepLeft("");
    const end = p.sleep.endsAt;
    const t = setInterval(() => setSleepLeft(clock((end - Date.now()) / 1000)), 1000);
    return () => clearInterval(t);
  }, [p.sleep]);

  const bookTotal = b.chapters.reduce((a, c) => a + c.duration, 0);
  const before = b.chapters.slice(0, p.index).reduce((a, c) => a + c.duration, 0);
  const left = Math.max(0, bookTotal - before - p.position);
  const chNotes = p.notes.filter((n) => b.chapters.some((c) => c.id === n.chapter_id));

  return (
    <>
      <div className="scrim" onClick={() => p.setExpanded(false)} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Audiobook player">
        <div className="sheet-in">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">Now playing</span>
            <button type="button" className="btn sm ghost" onClick={() => p.setExpanded(false)}>Close</button>
          </div>
          <div className="np">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.cover} alt="" />
            <div style={{ minWidth: 0 }}>
              <div className="muted small">{b.title} · {chLabel(ch.position)}</div>
              <h2>{ch.name}</h2>
              <div className="muted small">{Math.floor(left / 3600) ? `${Math.floor(left / 3600)} hr ` : ""}{Math.round((left % 3600) / 60)} min left in book</div>
            </div>
          </div>

          <input type="range" className="scrub" min={0} max={Math.max(1, Math.floor(p.duration))} step={1} value={Math.floor(p.position)} onChange={(e) => p.seek(Number(e.target.value))} aria-label="Position in chapter" />
          <div className="times mono"><span>{clock(p.position)}</span><span>-{clock(p.duration - p.position)}</span></div>

          <div className="ctrls">
            <button type="button" className="ic" disabled={p.index === 0} onClick={() => p.goChapter(p.index - 1)} aria-label="Previous chapter">{Icon.prev}</button>
            <button type="button" className="ic" onClick={() => p.skip(-15)} aria-label="Back 15 seconds">{Icon.back}<small>15</small></button>
            <button type="button" className="pp big" onClick={p.toggle} aria-label={p.playing ? "Pause" : "Play"}><PlayPauseIcon playing={p.playing} /></button>
            <button type="button" className="ic" onClick={() => p.skip(30)} aria-label="Forward 30 seconds">{Icon.fwd}<small>30</small></button>
            <button type="button" className="ic" disabled={!p.canPlay(p.index + 1)} onClick={() => p.goChapter(p.index + 1)} aria-label="Next chapter">{Icon.next}</button>
          </div>

          <div className="opts">
            <label className="opt">
              <span>Speed</span>
              <select value={p.rate} onChange={(e) => p.setRate(Number(e.target.value))} aria-label="Playback speed">
                {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
              </select>
            </label>
            <label className="opt">
              <span>Sleep{sleepLeft ? ` · ${sleepLeft}` : p.sleep.mode === "chapter" ? " · end of chapter" : ""}</span>
              <select value={p.sleep.mode === "off" ? "off" : p.sleep.mode === "chapter" ? "chapter" : "on"} onChange={(e) => p.setSleep(e.target.value === "off" ? "off" : e.target.value === "chapter" ? "chapter" : Number(e.target.value))} aria-label="Sleep timer">
                <option value="off">Off</option>
                {p.sleep.mode === "minutes" && <option value="on" hidden>On</option>}
                <option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option>
                <option value="chapter">End of chapter</option>
              </select>
            </label>
            <button type="button" className="btn" onClick={() => setDraft({ at: p.position, text: "" })}>+ Note</button>
          </div>

          {draft && (
            <form className="addnote" onSubmit={async (e) => { e.preventDefault(); await p.addNote(draft.text, draft.at); setDraft(null); setTab("notes"); }}>
              <label htmlFor="note-text" className="muted small">Note at <span className="mono">{clock(draft.at)}</span> · {ch.name}</label>
              <textarea id="note-text" autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="What do you want to remember or apply?" />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn sm ghost" onClick={() => setDraft(null)}>Cancel</button>
                <button type="submit" className="btn sm gold" disabled={!draft.text.trim()}>Save note</button>
              </div>
            </form>
          )}

          {p.error && <p className="error" role="alert">{p.error}</p>}
          {p.cta && (
            <div className="cta-box">
              {p.cta === "unlock" ? (
                <>
                  <b>That was the free chapter</b>
                  <p className="muted">Unlock the full audiobook, ebook and workbook to keep going.</p>
                  {b.orderUrl ? <a className="btn gold sm" href={b.orderUrl} target="_blank" rel="noopener">Unlock {b.title}</a> : <a className="btn gold sm" href={`/library/${b.slug}`}>See how to unlock</a>}
                </>
              ) : (
                <>
                  <b>{p.cta}</b>
                  {b.bookingUrl && <p><a className="btn gold sm" href={b.bookingUrl} target="_blank" rel="noopener" onClick={() => fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag: `aa-${b.slug}-call-clicked`, titleId: b.titleId }) })}>Book a strategy call</a></p>}
                </>
              )}
              <button type="button" className="lnk" onClick={p.dismissCta}>Dismiss</button>
            </div>
          )}

          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "chapters"} onClick={() => setTab("chapters")}>Chapters</button>
            <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>Notes ({chNotes.length})</button>
          </div>
          {tab === "chapters" ? (
            <ol className="chapters compact">
              {b.chapters.map((c, i) => {
                const ok = p.canPlay(i);
                return (
                  <li key={c.id} className={i === p.index ? "now" : ""}>
                    <span className="n">{c.position === 0 ? "Intro" : c.position}</span>
                    <button type="button" className="chbtn" disabled={!ok} onClick={() => p.goChapter(i)}>{c.name}{!c.hasAudio ? " · coming soon" : !ok ? " · 🔒︎" : ""}</button>
                    <span className="mono muted small">{clock(c.duration)}</span>
                  </li>
                );
              })}
            </ol>
          ) : chNotes.length ? (
            <div className="notes">
              {chNotes.map((n) => {
                const ci = b.chapters.findIndex((c) => c.id === n.chapter_id);
                return (
                  <div className="note" key={n.id}>
                    <button type="button" className="stamp" onClick={() => (ci === p.index ? p.seek(n.position_seconds) : p.load(b, ci, n.position_seconds))}>{chLabel(b.chapters[ci].position)} · {clock(n.position_seconds)}</button>
                    <p>{n.body}</p>
                    <button type="button" className="x" onClick={() => p.deleteNote(n.id)} aria-label="Delete note">×</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty">No notes yet. Tap “+ Note” to save a thought at this exact moment. Tap a note's time to jump back to it.</p>
          )}
        </div>
      </div>
    </>
  );
}
