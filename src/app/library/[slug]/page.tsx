import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/session";
import type { Title } from "@/lib/catalog";
import { Cover } from "../../Cover";

export const dynamic = "force-dynamic";

const mins = (s: number | null) => Math.max(1, Math.round((s ?? 0) / 60));

export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("titles")
    .select("id, slug, title, subtitle, series, description, status, cover_path, course_name, sort_order")
    .eq("slug", slug)
    .maybeSingle<Title>();
  if (!t) notFound();

  const [{ data: chapters }, { data: lessons }, { data: exercises }, { data: resources }, { data: ents }] = await Promise.all([
    supabase.from("chapters").select("id, position, name, duration_seconds, audio_file_id").eq("title_id", t.id).order("position"),
    supabase.from("lessons").select("id, position, name, duration_seconds, is_bonus").eq("title_id", t.id).order("position"),
    supabase.from("exercises").select("id, position, name").eq("title_id", t.id).order("position"),
    supabase.from("resources").select("id, name").eq("title_id", t.id).order("position"),
    supabase.from("entitlements").select("kind").eq("user_id", profile!.id).eq("title_id", t.id),
  ]);
  const book = !!ents?.some((e) => e.kind === "book");
  const course = !!ents?.some((e) => e.kind === "course");

  return (
    <main>
      <p style={{ marginTop: 22 }}><Link className="muted" href="/library">← Library</Link></p>
      <section className="titlehead">
        <Cover t={t} />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{t.series}</div>
          <h1 className="display">{t.title} <span className="sub">{t.subtitle}</span></h1>
          <p className="muted" style={{ fontSize: 17, maxWidth: "60ch" }}>{t.description}</p>
          <div className="row">
            {book ? <span className="pill own">You own the book</span> : <span className="pill">Book not unlocked</span>}
            {course ? <span className="pill own">You own the course</span> : <span className="pill">Course not unlocked</span>}
          </div>
          <p className="empty" style={{ marginTop: 18 }}>
            The audiobook player, workbook and course player arrive in the next build. This page already reads the
            real chapter, lesson and exercise lists from the database.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="sec-head"><h2>Audiobook</h2><span className="muted">{chapters?.length ?? 0} chapters</span></div>
        <ol className="chapters">
          {chapters?.map((c) => (
            <li key={c.id}>
              <span className="n">{c.position === 0 ? "Intro" : c.position}</span>
              <span>{c.name}</span>
              <span className="mono muted">{mins(c.duration_seconds)} min{book || c.position === 0 ? "" : " · 🔒︎"}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="block">
        <div className="sec-head"><h2>{t.course_name ?? "Course"}</h2><span className="muted">{lessons?.length ?? 0} video lessons</span></div>
        <ol className="chapters">
          {lessons?.map((l) => (
            <li key={l.id}>
              <span className="n">{l.is_bonus ? "Bonus" : l.position + 1}</span>
              <span>{l.name}</span>
              <span className="mono muted">{mins(l.duration_seconds)} min{course || l.position === 0 ? "" : " · 🔒︎"}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="block">
        <div className="sec-head"><h2>Workbook</h2><span className="muted">{exercises?.length ?? 0} exercises</span></div>
        <ol className="chapters">
          {exercises?.map((x) => (
            <li key={x.id}><span className="n">{String(x.position + 1).padStart(2, "0")}</span><span>{x.name}</span><span /></li>
          ))}
        </ol>
      </section>

      {!!resources?.length && (
        <section className="block">
          <div className="sec-head"><h2>Resources</h2></div>
          <div className="chips">{resources.map((r) => <span className="chip" key={r.id}>{r.name}</span>)}</div>
        </section>
      )}
    </main>
  );
}
