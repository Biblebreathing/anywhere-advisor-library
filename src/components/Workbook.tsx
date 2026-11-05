"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BookData } from "@/lib/book";
import { PlayButton } from "@/components/player/PlayButton";

const pad = (n: number) => String(n).padStart(2, "0");

/** Guided workbook: one exercise at a time in focus, answers autosave, printable as a PDF. */
export function Workbook({ d, userId }: { d: BookData; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const b = d.audio;
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => Object.fromEntries(d.exercises.map((x) => [x.id, d.answers[x.id]?.answers ?? []])));
  const [complete, setComplete] = useState<Record<string, boolean>>(() => Object.fromEntries(d.exercises.map((x) => [x.id, !!d.answers[x.id]?.completed_at])));
  const [open, setOpen] = useState<string | null>(() => d.exercises.find((x) => !d.answers[x.id]?.completed_at)?.id ?? d.exercises[0]?.id ?? null);
  const [status, setStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const doneCount = Object.values(complete).filter(Boolean).length;
  const pct = d.exercises.length ? Math.round((doneCount / d.exercises.length) * 100) : 0;

  async function persist(id: string, values: string[], completed?: boolean) {
    setStatus((s) => ({ ...s, [id]: "saving" }));
    const row: Record<string, unknown> = { user_id: userId, exercise_id: id, answers: values, updated_at: new Date().toISOString() };
    if (completed !== undefined) row.completed_at = completed ? new Date().toISOString() : null;
    const { error } = await supabase.from("exercise_answers").upsert(row, { onConflict: "user_id,exercise_id" });
    setStatus((s) => ({ ...s, [id]: error ? "error" : "saved" }));
  }
  function change(id: string, qi: number, v: string) {
    const next = [...(answers[id] ?? [])];
    next[qi] = v;
    setAnswers((a) => ({ ...a, [id]: next }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => persist(id, next), 700);
  }
  async function markDone(id: string, i: number) {
    clearTimeout(timers.current[id]);
    await persist(id, answers[id] ?? [], true);
    setComplete((c) => ({ ...c, [id]: true }));
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag: `aa-${b.slug}-workbook-ex${pad(i + 1)}-complete`, titleId: b.titleId }) }).catch(() => {});
    if (doneCount + 1 === d.exercises.length) fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag: `aa-${b.slug}-workbook-finished`, titleId: b.titleId }) }).catch(() => {});
    const nextOpen = d.exercises.slice(i + 1).find((x) => !complete[x.id]);
    setOpen(nextOpen?.id ?? null);
    if (nextOpen) setTimeout(() => document.getElementById(`ex-${nextOpen.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  if (!d.ownsBook) {
    return (
      <main className="narrow-wide">
        <p style={{ marginTop: 22 }}><Link className="muted" href={`/library/${b.slug}`}>← {b.title}</Link></p>
        <h1 className="display">Workbook</h1>
        <p className="muted">{d.exercises.length} exercises that turn each chapter into action in your own practice. Included with the book.</p>
        <ol className="chapters">{d.exercises.map((x, i) => <li key={x.id}><span className="n">{pad(i + 1)}</span><span>{x.name}</span><span className="muted">🔒︎</span></li>)}</ol>
        {b.orderUrl && <p><a className="btn gold" href={b.orderUrl} target="_blank" rel="noopener">Unlock the book</a></p>}
      </main>
    );
  }

  return (
    <main className="workbook">
      <p style={{ marginTop: 22 }} className="no-print"><Link className="muted" href={`/library/${b.slug}`}>← {b.title}</Link></p>
      <header className="wb-head">
        <div>
          <div className="eyebrow">{b.title} · Workbook</div>
          <h1 className="display">Put it to work</h1>
          <p className="muted no-print">Answer each exercise as you go. Everything saves automatically to your account.</p>
        </div>
        <div className="wb-progress no-print">
          <b className="mono">{doneCount}/{d.exercises.length}</b>
          <span className="muted small">exercises complete</span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="row tight">
            <button type="button" className="btn sm" onClick={() => window.print()}>Download as PDF</button>
            {d.files.workbook && <a className="btn sm ghost" href={`/api/media/workbook/${b.titleId}?dl=1`}>Printable blank</a>}
          </div>
        </div>
      </header>

      <div className="exs">
        {d.exercises.map((x, i) => {
          const ch = b.chapters.findIndex((c) => c.id === x.chapter_id);
          const isOpen = open === x.id;
          return (
            <section key={x.id} id={`ex-${x.id}`} className={`ex ${isOpen ? "open" : ""} ${complete[x.id] ? "done" : ""}`}>
              <button type="button" className="ex-sum" onClick={() => setOpen(isOpen ? null : x.id)} aria-expanded={isOpen}>
                <span className="exn mono">{pad(i + 1)}</span>
                <span style={{ minWidth: 0 }}>
                  <b>{x.name}</b>
                  {ch >= 0 && <span className="muted small"> · with “{b.chapters[ch].name}”</span>}
                </span>
                <span className={`chk ${complete[x.id] ? "on" : ""}`}>{complete[x.id] ? "✓" : ""}</span>
              </button>
              <div className="ex-body">
                {x.questions.map((q, qi) => (
                  <label key={qi} className="q">
                    <span>{q}</span>
                    <textarea value={answers[x.id]?.[qi] ?? ""} onChange={(e) => change(x.id, qi, e.target.value)} placeholder="Your answer" rows={3} />
                    <span className="print-answer">{answers[x.id]?.[qi] || "—"}</span>
                  </label>
                ))}
                <div className="row no-print" style={{ justifyContent: "space-between" }}>
                  <span className="row tight">
                    {ch >= 0 && <PlayButton book={b} index={ch} label="Listen to this chapter" className="btn sm ghost" />}
                    <span className="muted small">{status[x.id] === "saving" ? "Saving…" : status[x.id] === "saved" ? "Saved ✓" : status[x.id] === "error" ? "Couldn't save. Check your connection." : ""}</span>
                  </span>
                  {complete[x.id] ? (
                    <button type="button" className="btn sm ghost" onClick={async () => { await persist(x.id, answers[x.id] ?? [], false); setComplete((c) => ({ ...c, [x.id]: false })); }}>Mark not done</button>
                  ) : (
                    <button type="button" className="btn sm gold" onClick={() => markDone(x.id, i)}>Mark complete{i < d.exercises.length - 1 ? " & next" : ""}</button>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {doneCount === d.exercises.length && d.exercises.length > 0 && (
        <div className="cta-box no-print">
          <b>Workbook complete.</b>
          <p className="muted">You've done the thinking. Want a second set of eyes on your plan?</p>
          {b.bookingUrl && <a className="btn gold sm" href={b.bookingUrl} target="_blank" rel="noopener">Book a strategy call</a>}
        </div>
      )}
    </main>
  );
}
