import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/session";
import { TITLE_WITH_COUNTS, count, type TitleWithCounts } from "@/lib/catalog";
import { Cover } from "../Cover";

export const dynamic = "force-dynamic";
export const metadata = { title: "My library · The Anywhere Advisor Library" };

export default async function LibraryPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: titles }, { data: ents }] = await Promise.all([
    supabase.from("titles").select(TITLE_WITH_COUNTS).eq("status", "live").order("sort_order"),
    supabase.from("entitlements").select("title_id, kind").eq("user_id", profile!.id),
  ]);
  const owns = (id: string, kind: "book" | "course") => !!ents?.some((e) => e.title_id === id && e.kind === kind);
  const list = (titles ?? []) as TitleWithCounts[];
  const ownedCount = list.filter((t) => owns(t.id, "book")).length;

  return (
    <main>
      <section style={{ paddingBlock: 28 }}>
        <div className="sec-head">
          <h2 style={{ fontFamily: "var(--display)", fontSize: 32 }}>Your library</h2>
          <span className="muted">{ownedCount} of {list.length} titles unlocked</span>
        </div>
        {list.length === 0 && <div className="empty">No titles are live yet.</div>}
        <div className="list">
          {list.map((t) => {
            const book = owns(t.id, "book"), course = owns(t.id, "course");
            const chip = (on: boolean, label: string) => <span className={`chip ${on ? "" : "off"}`}>{on ? "✓" : "🔒︎"} {label}</span>;
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
                    {chip(book, "Ebook (PDF)")}
                    {chip(book, `Audiobook · ${count(t.chapters)} chapters`)}
                    {chip(book, `Workbook · ${count(t.exercises)} exercises`)}
                    {chip(course, `Course · ${count(t.lessons)} lessons`)}
                  </div>
                  <Link className={`btn sm ${book ? "" : "gold"}`} href={`/library/${t.slug}`}>
                    {book ? "Open" : "See what's inside"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
