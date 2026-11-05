import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/session";
import Link from "next/link";
import { coverUrl, type Title } from "@/lib/catalog";
import { AdminNav } from "@/components/admin/AdminNav";
import { createTitle } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · The Anywhere Advisor Library" };

type Row = Title & {
  chapters: { audio_file_id: string | null }[];
  lessons: { video_file_id: string | null; video_url: string | null }[];
  exercises: { id: string }[];
  resources: { file_id: string | null }[];
  title_files: { kind: string; is_current: boolean }[];
};

/** Give a student access by hand, e.g. a comp copy or a purchase made outside GHL. */
async function grantAccess(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const titleId = String(formData.get("title_id") ?? "");
  const grant = String(formData.get("grant") ?? "book");
  if (!email.includes("@") || !titleId) redirect("/admin?msg=grant-missing");

  const db = createAdminClient();
  let { data: p } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) redirect("/admin?msg=grant-failed");
    p = { id: data.user.id };
  }
  const kinds = grant === "both" ? ["book", "course"] : grant === "course" ? ["course", "book"] : ["book"];
  await db.from("entitlements").upsert(
    kinds.map((kind) => ({ user_id: p!.id, title_id: titleId, kind, source: "admin" })),
    { onConflict: "user_id,title_id,kind", ignoreDuplicates: true },
  );
  await db.from("change_log").insert({ title_id: titleId, actor_id: staff.id, summary: `Gave ${email} access (${kinds.join(" + ")})` });
  revalidatePath("/admin");
  redirect(`/admin?msg=granted&to=${encodeURIComponent(email)}`);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data }, { count: students }, { data: changes }] = await Promise.all([
    supabase
      .from("titles")
      .select("id, slug, title, subtitle, series, description, status, cover_path, course_name, sort_order, chapters(audio_file_id), lessons(video_file_id, video_url), exercises(id), resources(file_id), title_files(kind, is_current)")
      .order("sort_order"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    supabase.from("change_log").select("id, summary, created_at, titles(title)").order("created_at", { ascending: false }).limit(10),
  ]);
  const titles = (data ?? []) as unknown as Row[];

  const live = titles.filter((t) => t.status === "live").length;
  const sum = (f: (t: Row) => number) => titles.reduce((a, t) => a + f(t), 0);
  const audioDone = sum((t) => t.chapters.filter((c) => c.audio_file_id).length), audioAll = sum((t) => t.chapters.length);
  const vidDone = sum((t) => t.lessons.filter((l) => l.video_file_id || l.video_url).length), vidAll = sum((t) => t.lessons.length);
  const pdfs = titles.filter((t) => t.title_files.some((f) => f.kind === "ebook_pdf" && f.is_current)).length;

  return (
    <main>
      <section style={{ paddingBlock: "28px 20px" }}>
        <AdminNav current="titles" />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <h1 className="display">Manage your library</h1>
          <form action={createTitle}><button className="btn gold" type="submit">+ Add a title</button></form>
        </div>
        {sp.msg === "granted" && <p className="pill own">Access granted to {sp.to}</p>}
        {sp.msg?.startsWith("grant-") && <p className="error">Enter an email and choose a title.</p>}
      </section>

      <div className="stats">
        <div className="stat"><b>{live}</b><span>Live titles · {titles.length - live} draft</span></div>
        <div className="stat"><b>{students ?? 0}</b><span>Students</span></div>
        <div className="stat"><b>{audioDone}/{audioAll}</b><span>Audio chapters uploaded</span></div>
        <div className="stat"><b>{vidDone}/{vidAll}</b><span>Course videos added · PDFs {pdfs}/{titles.length}</span></div>
      </div>

      <section className="block">
        <div className="sec-head"><h2>Titles</h2><span className="muted">Open a title to upload files and edit its content</span></div>
        <div className="tlist">
          {titles.map((t) => {
            const a = t.chapters.filter((c) => c.audio_file_id).length;
            const v = t.lessons.filter((l) => l.video_file_id || l.video_url).length;
            const pdf = t.title_files.some((f) => f.kind === "ebook_pdf" && f.is_current);
            const chip = (ok: boolean, label: string) => <span className={`chip ${ok ? "" : "off"}`}>{ok ? "✓" : "○"} {label}</span>;
            return (
              <Link className="trow" href={`/admin/titles/${t.id}`} key={t.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl(t)} alt="" />
                <span style={{ minWidth: 0 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <b>{t.title}</b>
                    <span className={`pill ${t.status === "live" ? "own" : ""}`}>{t.status === "live" ? "Live" : "Draft"}</span>
                  </span>
                  <span className="chips" style={{ marginTop: 6 }}>
                    {chip(!!t.cover_path, "Cover")}
                    {chip(pdf, "PDF")}
                    {chip(a > 0 && a === t.chapters.length, `Audio ${a}/${t.chapters.length}`)}
                    {chip(t.exercises.length > 0, `Workbook ${t.exercises.length}`)}
                    {chip(v > 0 && v === t.lessons.length, `Course videos ${v}/${t.lessons.length}`)}
                    {chip(t.resources.length > 0 && t.resources.every((r) => r.file_id), `Resources ${t.resources.filter((r) => r.file_id).length}/${t.resources.length}`)}
                  </span>
                </span>
                <span className="btn sm">Edit</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="block">
        <div className="sec-head"><h2>Give a student access</h2><span className="muted">For comp copies or purchases made outside GHL</span></div>
        <form action={grantAccess} className="panel" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
          <label className="fld" htmlFor="g-email"><span>Student email</span><input className="inp" id="g-email" name="email" type="email" required /></label>
          <label className="fld" htmlFor="g-title"><span>Title</span>
            <select className="inp" id="g-title" name="title_id">{titles.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
          </label>
          <label className="fld" htmlFor="g-grant"><span>Access</span>
            <select className="inp" id="g-grant" name="grant"><option value="book">Book (PDF, audiobook, workbook)</option><option value="both">Book + course</option></select>
          </label>
          <button className="btn gold" type="submit">Give access</button>
        </form>
      </section>

      <section className="block">
        <div className="sec-head"><h2>Recent changes</h2></div>
        {changes?.length ? (
          <ol className="chapters">
            {changes.map((c: any) => (
              <li key={c.id}>
                <span className="n">{new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span>{c.titles?.title ? <b>{c.titles.title} · </b> : null}{c.summary}</span><span />
              </li>
            ))}
          </ol>
        ) : <div className="empty">No changes yet.</div>}
      </section>
    </main>
  );
}
