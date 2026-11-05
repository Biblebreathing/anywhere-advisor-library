"use client";

import Link from "next/link";
import { useState } from "react";
import type { BookData } from "@/lib/book";
import { PlayButton } from "@/components/player/PlayButton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { chLabel, clock } from "@/components/player/Player";

const hm = (sec: number) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`; };

export function BookView({ d }: { d: BookData }) {
  const p = usePlayer();
  const [tab, setTab] = useState<"audio" | "resources" | "notes">("audio");
  const b = d.audio;
  const total = b.chapters.reduce((a, c) => a + c.duration, 0);
  const resumeIdx = Math.max(0, b.chapters.findIndex((c) => c.id === d.progress?.chapter_id));
  const before = b.chapters.slice(0, resumeIdx).reduce((a, c) => a + c.duration, 0);
  const listenedPct = d.progress ? Math.min(100, Math.round(((before + d.progress.position_seconds) / Math.max(1, total)) * 100)) : 0;
  const wbDone = Object.values(d.answers).filter((a) => a.completed_at).length;
  const lsDone = d.lessonsDone.length;
  const firstLesson = d.lessons.find((l) => !d.lessonsDone.includes(l.id)) ?? d.lessons[0];
  const notes = p.book?.titleId === b.titleId ? p.notes : d.notes;
  const audioReady = b.chapters.some((c) => c.hasAudio);

  return (
    <main>
      <p style={{ marginTop: 22 }}><Link className="muted" href="/library">← Library</Link></p>
      <section className="titlehead">
        <span className="frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bgi" src={b.cover} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="fgi" src={b.cover} alt={`${b.title} cover`} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{d.title.series}</div>
          <h1 className="display">{d.title.title} <span className="sub">{d.title.subtitle}</span></h1>
          <p className="muted lede2">{d.title.description}</p>
          {!d.ownsBook && (
            <div className="row" style={{ marginBottom: 16 }}>
              {b.orderUrl ? <a className="btn gold" href={b.orderUrl} target="_blank" rel="noopener">Unlock the book</a> : null}
              <PlayButton book={b} index={0} label="Listen to the free chapter" className="btn ghost" />
            </div>
          )}

          <div className="fmts4">
            <div className={`f4 ${d.ownsBook ? "" : "locked"}`}>
              <div className="k">Ebook</div>
              <div className="v">{d.ownsBook ? (d.files.ebook ? "Read online or download" : "PDF coming soon") : "Included with the book"}</div>
              {d.ownsBook && d.files.ebook ? (
                <div className="row tight">
                  <a className="btn sm" href={`/api/media/ebook/${b.titleId}`} target="_blank" rel="noopener">Read</a>
                  <a className="btn sm ghost" href={`/api/media/ebook/${b.titleId}?dl=1`}>Download</a>
                </div>
              ) : <span className="btn sm ghost disabled">🔒︎ {d.ownsBook ? "Soon" : "Locked"}</span>}
            </div>
            <div className={`f4 ${d.ownsBook ? "" : "locked"}`}>
              <div className="k">Audiobook</div>
              <div className="v">{audioReady ? (d.progress ? `${listenedPct}% · ${hm(Math.max(0, total - before - d.progress.position_seconds))} left` : hm(total)) : "Recording coming soon"}</div>
              <div className="bar"><i style={{ width: `${listenedPct}%` }} /></div>
              <PlayButton book={b} index={d.ownsBook ? resumeIdx : 0} position={d.ownsBook ? d.progress?.position_seconds ?? 0 : 0} label={d.progress && d.ownsBook ? "Resume" : d.ownsBook ? "Listen" : "Free chapter"} className="btn sm" />
            </div>
            <div className={`f4 ${d.ownsBook ? "" : "locked"}`}>
              <div className="k">Workbook</div>
              <div className="v">{wbDone} of {d.exercises.length} exercises done</div>
              <div className="bar"><i style={{ width: `${d.exercises.length ? (wbDone / d.exercises.length) * 100 : 0}%` }} /></div>
              <Link className="btn sm" href={`/library/${b.slug}/workbook`}>{d.ownsBook ? (wbDone ? "Continue" : "Start") : "Preview"}</Link>
            </div>
            <div className={`f4 ${d.ownsCourse ? "" : "locked"}`}>
              <div className="k">Course</div>
              <div className="v">{d.ownsCourse ? `${lsDone} of ${d.lessons.length} lessons` : `${d.lessons.length} video lessons`}</div>
              <div className="bar"><i style={{ width: `${d.lessons.length ? (lsDone / d.lessons.length) * 100 : 0}%` }} /></div>
              {firstLesson && <Link className={`btn sm ${d.ownsCourse ? "" : "gold"}`} href={`/library/${b.slug}/course/${firstLesson.id}`}>{d.ownsCourse ? (lsDone ? "Continue" : "Start course") : "Free preview"}</Link>}
            </div>
          </div>
        </div>
      </section>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "audio"} onClick={() => setTab("audio")}>Chapters</button>
        <button type="button" role="tab" aria-selected={tab === "resources"} onClick={() => setTab("resources")}>Resources ({d.resources.length})</button>
        <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>My notes ({notes.length})</button>
      </div>

      {tab === "audio" && (
        <ol className="chapters">
          {b.chapters.map((c, i) => {
            const done = d.chaptersDone.includes(c.id);
            const isNow = p.book?.titleId === b.titleId ? p.index === i : d.progress?.chapter_id === c.id;
            const pos = p.book?.titleId === b.titleId && p.index === i ? p.position : d.progress?.chapter_id === c.id ? d.progress.position_seconds : 0;
            return (
              <li key={c.id} className={isNow ? "now" : ""}>
                <span className="n">{c.position === 0 ? "Intro" : c.position}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{c.name}</div>
                  <div className="sub2">
                    <span className="mono">{clock(c.duration)}</span>
                    {done && <span className="done">✓ Finished</span>}
                    {!done && pos > 0 && <span className="bar mini2"><i style={{ width: `${(pos / Math.max(1, c.duration)) * 100}%` }} /></span>}
                    {!d.ownsBook && i === 0 && <span className="pill sample">Free sample</span>}
                    {!c.hasAudio && <span className="muted">Audio coming soon</span>}
                  </div>
                </div>
                <PlayButton book={b} index={i} position={!done ? pos : 0} />
              </li>
            );
          })}
        </ol>
      )}

      {tab === "resources" && (
        d.resources.length ? (
          <div className="res">
            {d.resources.map((r) =>
              d.ownsBook && r.hasFile ? (
                <a key={r.id} className="fmt" href={`/api/media/resource/${r.id}?dl=1`}><b>{r.name}</b><span>Download</span></a>
              ) : (
                <div key={r.id} className="fmt locked"><b>{r.name}</b><span>{d.ownsBook ? "Coming soon" : "🔒︎ Included with the book"}</span></div>
              ),
            )}
          </div>
        ) : <p className="empty">No resources for this title yet.</p>
      )}

      {tab === "notes" && (
        notes.length ? (
          <div className="notes">
            {notes.map((n) => {
              const ci = b.chapters.findIndex((c) => c.id === n.chapter_id);
              if (ci < 0) return null;
              return (
                <div className="note" key={n.id}>
                  <button type="button" className="stamp" onClick={() => { p.load(b, ci, n.position_seconds, true); p.setExpanded(true); }}>{chLabel(b.chapters[ci].position)} · {clock(n.position_seconds)}</button>
                  <p>{n.body}</p>
                  <button type="button" className="x" onClick={() => p.deleteNote(n.id).then(() => location.reload())} aria-label="Delete note">×</button>
                </div>
              );
            })}
          </div>
        ) : <p className="empty">No notes yet. While listening, tap “+ Note” in the player to save a thought at that exact moment.</p>
      )}
    </main>
  );
}
