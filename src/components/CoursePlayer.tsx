"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type CourseLesson = { id: string; position: number; name: string; duration: number; is_bonus: boolean; hasVideo: boolean };
type Props = {
  userId: string; slug: string; titleId: string; title: string; courseName: string; cover: string;
  lessons: CourseLesson[]; done: string[]; current: string; owned: boolean;
  source: { type: "file"; src: string } | { type: "embed"; src: string } | { type: "link"; src: string } | { type: "none" } | { type: "locked" };
  orderUrl: string | null; bookingUrl: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const mins = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;
const track = (tag: string, titleId: string) =>
  fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag, titleId }), keepalive: true }).catch(() => {});

/** Kajabi / Teachable-style course player: video, curriculum sidebar with checkmarks, Complete & continue. */
export function CoursePlayer(props: Props) {
  const { lessons, current, slug, titleId } = props;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [done, setDone] = useState<string[]>(props.done);
  const [saving, setSaving] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const idx = lessons.findIndex((l) => l.id === current);
  const lesson = lessons[idx];
  const next = lessons[idx + 1];
  const prev = lessons[idx - 1];
  const isDone = done.includes(current);
  const pct = lessons.length ? Math.round((done.length / lessons.length) * 100) : 0;
  const canWatch = (i: number) => props.owned || i === 0;

  async function complete(goNext: boolean) {
    if (!props.owned && idx !== 0) return;
    setSaving(true);
    if (!isDone) {
      await supabase.from("lesson_completions").upsert({ user_id: props.userId, lesson_id: current }, { onConflict: "user_id,lesson_id", ignoreDuplicates: true });
      const nowDone = [...done, current];
      setDone(nowDone);
      track(`aa-${slug}-course-lesson${pad(idx + 1)}-complete`, titleId);
      if (props.owned && nowDone.length === lessons.length) track(`aa-${slug}-course-finished`, titleId);
    }
    setSaving(false);
    if (goNext && next && canWatch(idx + 1)) router.push(`/library/${slug}/course/${next.id}`);
  }

  // Resume where they left off; mark complete automatically near the end.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const key = `aa-lesson-pos-${current}`;
    const onMeta = () => { try { const t = Number(localStorage.getItem(key)); if (t > 5 && t < v.duration - 10) v.currentTime = t; } catch {} };
    let last = 0;
    const onTime = () => {
      if (Date.now() - last > 5000) { last = Date.now(); try { localStorage.setItem(key, String(Math.floor(v.currentTime))); } catch {} }
      if (v.duration && v.currentTime / v.duration > 0.92 && !done.includes(current)) complete(false);
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    return () => { v.removeEventListener("loadedmetadata", onMeta); v.removeEventListener("timeupdate", onTime); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, done]);

  return (
    <div className="course">
      <div className="course-main">
        <p className="crumbs"><Link className="muted" href={`/library/${slug}`}>← {props.title}</Link></p>
        <div className="player-box">
          {props.source.type === "file" && <video ref={video} key={current} controls playsInline preload="metadata" src={props.source.src} />}
          {props.source.type === "embed" && <iframe key={current} src={props.source.src} title={lesson.name} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />}
          {props.source.type === "link" && (
            <div className="vid-msg"><b>{lesson.name}</b><a className="btn gold" href={props.source.src} target="_blank" rel="noopener">Watch the lesson</a></div>
          )}
          {props.source.type === "none" && <div className="vid-msg"><b>{lesson.name}</b><span className="muted">This lesson's video is coming soon.</span></div>}
          {props.source.type === "locked" && (
            <div className="vid-msg">
              <b>Add the course to watch this lesson</b>
              <span className="muted">{props.courseName}: {lessons.length} video lessons that walk you through it step by step.</span>
              {props.orderUrl ? <a className="btn gold" href={props.orderUrl} target="_blank" rel="noopener">Add the course</a> : <Link className="btn gold" href={`/library/${slug}`}>See how to unlock</Link>}
            </div>
          )}
        </div>

        <div className="lesson-head">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{lesson.is_bonus ? "Bonus lesson" : `Lesson ${idx + 1} of ${lessons.length}`}</div>
            <h1>{lesson.name}</h1>
          </div>
          <div className="row">
            {prev && <Link className="btn ghost" href={`/library/${slug}/course/${prev.id}`}>← Previous</Link>}
            {canWatch(idx) && (
              next ? (
                <button type="button" className="btn gold" disabled={saving} onClick={() => complete(true)}>{isDone ? "Next lesson →" : "Complete & continue →"}</button>
              ) : (
                <button type="button" className="btn gold" disabled={saving || isDone} onClick={() => complete(false)}>{isDone ? "✓ Course complete" : "Complete course"}</button>
              )
            )}
          </div>
        </div>

        {props.owned && done.length === lessons.length && (
          <div className="cta-box">
            <b>You finished {props.courseName}.</b>
            <p className="muted">Want it built with you, not just explained to you?</p>
            {props.bookingUrl && <a className="btn gold sm" href={props.bookingUrl} target="_blank" rel="noopener" onClick={() => track(`aa-${slug}-call-clicked`, titleId)}>Book a strategy call</a>}
          </div>
        )}
      </div>

      <aside className="curriculum" aria-label="Course lessons">
        <div className="cur-head">
          <b>{props.courseName}</b>
          <div className="muted small">{done.length} of {lessons.length} complete · {pct}%</div>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <ol>
          {lessons.map((l, i) => {
            const ok = canWatch(i);
            const d = done.includes(l.id);
            return (
              <li key={l.id} className={l.id === current ? "now" : ""}>
                <span className={`chk ${d ? "on" : ""}`} aria-label={d ? "Complete" : "Not complete"}>{d ? "✓" : ""}</span>
                {ok ? <Link href={`/library/${slug}/course/${l.id}`}>{l.is_bonus ? "Bonus · " : `${i + 1}. `}{l.name}</Link> : <span className="muted">{i + 1}. {l.name}</span>}
                <span className="muted small">{ok ? mins(l.duration) : "🔒︎"}</span>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
