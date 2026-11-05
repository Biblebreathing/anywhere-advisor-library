import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/session";
import { TITLE_WITH_COUNTS, count, coverUrl, type TitleWithCounts } from "@/lib/catalog";
import type { BookAudio } from "@/lib/book";
import { PlayButton } from "@/components/player/PlayButton";
import { Cover } from "../Cover";

export const dynamic = "force-dynamic";
export const metadata = { title: "My library · The Anywhere Advisor Library" };

const hm = (sec: number) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`; };

export default async function LibraryPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: titles }, { data: ents }, { data: progress }, { data: site }] = await Promise.all([
    supabase.from("titles").select(`${TITLE_WITH_COUNTS}, ghl_order_url, sales_url`).eq("status", "live").order("sort_order"),
    supabase.from("entitlements").select("title_id, kind").eq("user_id", profile!.id),
    supabase.from("audio_progress").select("title_id, chapter_id, position_seconds, updated_at").eq("user_id", profile!.id).order("updated_at", { ascending: false }),
    supabase.from("site_settings").select("booking_url").eq("id", 1).maybeSingle(),
  ]);
  const list = (titles ?? []) as (TitleWithCounts & { ghl_order_url: string | null; sales_url: string | null })[];
  const owns = (id: string, kind: "book" | "course") => !!ents?.some((e) => e.title_id === id && (e.kind === kind || (kind === "book" && e.kind === "course")));
  const ownedCount = list.filter((t) => owns(t.id, "book")).length;

  // "Continue listening" uses the most recent audiobook position.
  const last = progress?.find((p) => list.some((t) => t.id === p.title_id));
  let hero: { book: BookAudio; index: number; pos: number; left: number; pct: number; chapterName: string } | null = null;
  if (last) {
    const t = list.find((x) => x.id === last.title_id)!;
    const { data: ch } = await supabase.from("chapters").select("id, position, name, duration_seconds, audio_file_id, cta").eq("title_id", t.id).order("position");
    const chapters = (ch ?? []).map((c) => ({ id: c.id, position: c.position, name: c.name, duration: Number(c.duration_seconds ?? 0), hasAudio: !!c.audio_file_id, cta: c.cta }));
    const index = Math.max(0, chapters.findIndex((c) => c.id === last.chapter_id));
    const total = chapters.reduce((a, c) => a + c.duration, 0);
    const before = chapters.slice(0, index).reduce((a, c) => a + c.duration, 0) + Number(last.position_seconds);
    hero = {
      book: { titleId: t.id, slug: t.slug, title: t.title, cover: coverUrl(t), owned: owns(t.id, "book"), bookingUrl: site?.booking_url ?? null, orderUrl: t.ghl_order_url || t.sales_url, chapters },
      index, pos: Number(last.position_seconds), left: Math.max(0, total - before), pct: total ? Math.round((before / total) * 100) : 0, chapterName: chapters[index]?.name ?? "",
    };
  }
  const listened = (id: string) => {
    const p = progress?.find((x) => x.title_id === id);
    return p ? true : false;
  };

  return (
    <main>
      {hero && (
        <section className="hero">
          <Link href={`/library/${hero.book.slug}`}><Cover t={{ cover_path: list.find((t) => t.id === hero!.book.titleId)!.cover_path, title: hero.book.title }} /></Link>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Continue listening</div>
            <h1 className="display" style={{ marginBlock: "6px 8px" }}>{hero.book.title}</h1>
            <p className="muted" style={{ margin: "0 0 12px" }}>{hero.index === 0 ? "Introduction" : `Chapter ${hero.index}`}: {hero.chapterName} · {hm(hero.left)} left</p>
            <div className="bar" style={{ maxWidth: 420, marginBottom: 16 }}><i style={{ width: `${hero.pct}%` }} /></div>
            <div className="row">
              <PlayButton book={hero.book} index={hero.index} position={hero.pos} label="Resume" className="btn gold" />
              <Link className="btn ghost" href={`/library/${hero.book.slug}`}>Book, workbook &amp; course</Link>
            </div>
          </div>
        </section>
      )}

      <section style={{ paddingBlock: 28 }} className={hero ? "block" : ""}>
        <div className="sec-head">
          <h2 style={{ fontFamily: "var(--display)", fontSize: 32 }}>Your library</h2>
          <span className="muted">{ownedCount} of {list.length} titles unlocked</span>
        </div>
        {list.length === 0 && <div className="empty">No titles are live yet.</div>}
        <div className="list">
          {list.map((t) => {
            const book = owns(t.id, "book"), course = owns(t.id, "course");
            const chip = (on: boolean, label: string) => <span className={`chip ${on ? "" : "off"}`}>{on ? "✓" : "🔒︎"} {label}</span>;
            const order = t.ghl_order_url || t.sales_url;
            return (
              <article className="lrow" key={t.id}>
                <Link href={`/library/${t.slug}`}><Cover t={t} /></Link>
                <div style={{ minWidth: 0 }}>
                  <div className="row">
                    <span className="eyebrow">{t.series}</span>
                    {book ? <span className="pill own">Owned</span> : <span className="pill">Not unlocked</span>}
                  </div>
                  <h3><Link href={`/library/${t.slug}`}>{t.title}</Link> <span className="sub">{t.subtitle}</span></h3>
                  <p>{t.description}</p>
                  <div className="chips" style={{ marginBottom: 14 }}>
                    {chip(book, "Ebook")}
                    {chip(book, `Audiobook · ${count(t.chapters)} chapters`)}
                    {chip(book, `Workbook · ${count(t.exercises)} exercises`)}
                    {chip(course, `Course · ${count(t.lessons)} lessons`)}
                  </div>
                  <div className="row">
                    {book ? (
                      <>
                        <Link className="btn sm gold" href={`/library/${t.slug}`}>{listened(t.id) ? "Continue" : "Start"}</Link>
                        <Link className="btn sm" href={`/library/${t.slug}/workbook`}>Workbook</Link>
                        <Link className="btn sm" href={`/library/${t.slug}/course`}>{course ? "Course" : "Course preview"}</Link>
                      </>
                    ) : (
                      <>
                        {order && <a className="btn sm gold" href={order} target="_blank" rel="noopener">Unlock</a>}
                        <Link className={`btn sm ${order ? "" : "gold"}`} href={`/library/${t.slug}`}>Free chapter &amp; preview</Link>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
