import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/session";
import { AdminNav } from "@/components/admin/AdminNav";
import { AccessToggle } from "@/components/admin/AccessToggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students · Admin" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const { q } = await searchParams;
  const db = createAdminClient();

  let query = db.from("profiles").select("id, email, full_name, role, created_at").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.ilike("email", `%${q.replace(/[%_]/g, "")}%`);
  const [{ data: people }, { data: titles }] = await Promise.all([
    query,
    db.from("titles").select("id, slug, title, chapters(count), lessons(count)").order("sort_order"),
  ]);
  const ids = (people ?? []).map((p) => p.id);
  const [{ data: ents }, { data: chDone }, { data: lsDone }, { data: last }] = await Promise.all([
    db.from("entitlements").select("user_id, title_id, kind").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("chapter_completions").select("user_id, chapters(title_id)").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("lesson_completions").select("user_id, lessons(title_id)").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("events").select("user_id, created_at").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(1000),
  ]);
  const lastSeen = new Map<string, string>();
  (last ?? []).forEach((e) => { if (!lastSeen.has(e.user_id)) lastSeen.set(e.user_id, e.created_at); });
  const pct = (done: number, all: number) => (all ? Math.round((done / all) * 100) : 0);

  return (
    <main>
      <section style={{ paddingBlock: "28px 8px" }}>
        <AdminNav current="students" />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <h1 className="display">Students</h1>
          <form className="row" action="/admin/students">
            <input className="inp" name="q" defaultValue={q} placeholder="Search by email" aria-label="Search by email" style={{ width: 240 }} />
            <button className="btn sm" type="submit">Search</button>
          </form>
        </div>
        <p className="muted">{people?.length ?? 0} people{q ? ` matching “${q}”` : ""}. Tick a box to give or remove access; it takes effect immediately.</p>
      </section>

      <div className="scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th>Student</th>
              {(titles ?? []).map((t) => <th key={t.id} colSpan={2}>{t.title}</th>)}
              <th>Last active</th>
            </tr>
            <tr className="sub-h">
              <th />
              {(titles ?? []).map((t) => [<th key={t.id + "b"}>Book · listened</th>, <th key={t.id + "c"}>Course · done</th>])}
              <th />
            </tr>
          </thead>
          <tbody>
            {(people ?? []).map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.full_name || p.email}</b>
                  <div className="muted small">{p.full_name ? p.email : ""} {p.role !== "student" && <span className="pill own">{p.role}</span>}</div>
                </td>
                {(titles ?? []).map((t: any) => {
                  const has = (k: string) => !!ents?.some((e) => e.user_id === p.id && e.title_id === t.id && e.kind === k);
                  const ch = chDone?.filter((c: any) => c.user_id === p.id && c.chapters?.title_id === t.id).length ?? 0;
                  const ls = lsDone?.filter((c: any) => c.user_id === p.id && c.lessons?.title_id === t.id).length ?? 0;
                  return [
                    <td key={t.id + "b"}><AccessToggle userId={p.id} titleId={t.id} kind="book" on={has("book")} /> <span className="muted small">{has("book") ? `${pct(ch, t.chapters[0]?.count ?? 0)}%` : ""}</span></td>,
                    <td key={t.id + "c"}><AccessToggle userId={p.id} titleId={t.id} kind="course" on={has("course")} /> <span className="muted small">{has("course") ? `${pct(ls, t.lessons[0]?.count ?? 0)}%` : ""}</span></td>,
                  ];
                })}
                <td className="muted small">{lastSeen.get(p.id) ? new Date(lastSeen.get(p.id)!).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
