"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addItem, deleteItem, deleteTitle, moveItem, removeFile, restoreVersion, setStatus, updateItem, updateTitle,
} from "@/app/admin/actions";
import { DropZone, UploadButton } from "./Uploader";

export type FileInfo = { id: string; name: string; size_bytes: number | null; duration_seconds: number | null; created_at: string } | null;
export type EditorData = {
  title: {
    id: string; slug: string; title: string; subtitle: string | null; series: string | null; description: string | null;
    status: "draft" | "live"; cover_url: string; has_cover: boolean; course_name: string | null;
    ghl_book_product_id: string | null; ghl_course_product_id: string | null; ghl_order_url: string | null; sales_url: string | null;
  };
  chapters: { id: string; position: number; name: string; cta: string | null; duration_seconds: number | null; file: FileInfo }[];
  exercises: { id: string; position: number; name: string; chapter_id: string | null; questions: string[] }[];
  lessons: { id: string; position: number; name: string; video_url: string | null; duration_seconds: number | null; is_bonus: boolean; file: FileInfo }[];
  resources: { id: string; position: number; name: string; file: FileInfo }[];
  versions: { id: string; kind: string; is_current: boolean; created_at: string; file: FileInfo }[];
  changes: { id: number; summary: string; created_at: string }[];
};

const SECTIONS = [
  ["details", "Details"], ["cover", "Cover"], ["ebook", "Ebook"], ["audio", "Audiobook"],
  ["workbook", "Workbook"], ["course", "Course"], ["resources", "Resources"], ["offers", "Offers & GHL"], ["history", "History"],
] as const;
type Section = (typeof SECTIONS)[number][0];

const mb = (n: number | null) => (n ? (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "");
const clock = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const trackNo = (p: number) => String(p + 1).padStart(2, "0");

/** Saves on blur when the value changed; shows errors inline. */
function Field({
  label, value, onSave, placeholder, area, type = "text", hint,
}: { label?: string; value: string | number | null; onSave: (v: string) => Promise<unknown>; placeholder?: string; area?: boolean; type?: string; hint?: string }) {
  const [v, setV] = useState(String(value ?? ""));
  const [state, setState] = useState<"" | "saving" | "saved" | string>("");
  const save = async () => {
    if (v === String(value ?? "")) return;
    setState("saving");
    try { await onSave(v); setState("saved"); setTimeout(() => setState(""), 1500); }
    catch (e) { setState(e instanceof Error ? e.message : "Couldn't save"); }
  };
  const common = { className: "inp", value: v, placeholder, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value), onBlur: save, "aria-label": label ?? placeholder };
  return (
    <label className="fld">
      {label && <span>{label}{state === "saving" ? " · saving…" : state === "saved" ? " · saved ✓" : ""}</span>}
      {area ? <textarea rows={3} {...common} /> : <input type={type} {...common} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />}
      {hint && <small className="muted">{hint}</small>}
      {state && !["saving", "saved"].includes(state) && <small className="error">{state}</small>}
    </label>
  );
}

function FileLine({ file, preview, onRemove }: { file: FileInfo; preview?: string; onRemove?: () => void }) {
  if (!file) return <span className="miss">No file yet</span>;
  return (
    <span className="okf">
      ✓ {file.name}
      <span className="muted"> · {mb(file.size_bytes)}{file.duration_seconds ? ` · ${clock(file.duration_seconds)}` : ""}</span>
      {preview && <a className="lnk" href={preview} target="_blank" rel="noopener">Preview</a>}
      {onRemove && <button type="button" className="lnk" onClick={onRemove}>Remove</button>}
    </span>
  );
}

function RowTools({ table, id, i, n }: { table: "chapters" | "exercises" | "lessons" | "resources"; id: string; i: number; n: number }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<unknown>) => start(async () => { try { setErr(""); await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } });
  return (
    <span className="tools" aria-busy={pending}>
      <button type="button" className="icb" disabled={i === 0 || pending} onClick={() => run(() => moveItem(table, id, -1))} aria-label="Move up">↑</button>
      <button type="button" className="icb" disabled={i === n - 1 || pending} onClick={() => run(() => moveItem(table, id, 1))} aria-label="Move down">↓</button>
      {confirm ? (
        <>
          <button type="button" className="btn sm danger" onClick={() => run(() => deleteItem(table, id))}>Delete</button>
          <button type="button" className="btn sm ghost" onClick={() => setConfirm(false)}>Keep</button>
        </>
      ) : (
        <button type="button" className="icb" onClick={() => setConfirm(true)} aria-label="Delete">×</button>
      )}
      {err && <span className="error small">{err}</span>}
    </span>
  );
}

function AddButton({ table, titleId, label }: { table: "chapters" | "exercises" | "lessons" | "resources"; titleId: string; label: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn sm" disabled={pending} onClick={() => start(async () => { await addItem(table, titleId); })}>{pending ? "Adding…" : `+ ${label}`}</button>;
}

export function TitleEditor({ data, initialSection }: { data: EditorData; initialSection?: string }) {
  const router = useRouter();
  const t = data.title;
  const [sec, setSec] = useState<Section>((SECTIONS.find((s) => s[0] === initialSection)?.[0] ?? "details") as Section);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const go = (s: Section) => { setSec(s); router.replace(`?s=${s}`, { scroll: false }); };

  const audioDone = data.chapters.filter((c) => c.file).length;
  const videoDone = data.lessons.filter((l) => l.file || l.video_url).length;
  const cur = (k: string) => data.versions.find((v) => v.kind === k && v.is_current);
  const chips: [boolean, string][] = [
    [t.has_cover, "Cover"], [!!cur("ebook_pdf"), "Ebook PDF"], [audioDone > 0 && audioDone === data.chapters.length, `Audio ${audioDone}/${data.chapters.length}`],
    [data.exercises.length > 0, `Workbook ${data.exercises.length}`], [videoDone > 0 && videoDone === data.lessons.length, `Course videos ${videoDone}/${data.lessons.length}`],
    [data.resources.length > 0 && data.resources.every((r) => r.file), `Resources ${data.resources.filter((r) => r.file).length}/${data.resources.length}`],
  ];

  const versionsBlock = (kind: string, label: string) => {
    const old = data.versions.filter((v) => v.kind === kind && !v.is_current);
    if (!old.length) return null;
    return (
      <div className="vers">
        <h4>Previous {label} versions</h4>
        {old.map((v) => (
          <div className="fcard" key={v.id}>
            <span><b>{v.file?.name}</b><span className="muted"> · {mb(v.file?.size_bytes ?? null)} · {day(v.created_at)}</span></span>
            <span className="row">
              {v.file && <a className="lnk" href={`/api/media/file/${v.file.id}`} target="_blank" rel="noopener">Open</a>}
              <button type="button" className="btn sm ghost" onClick={() => start(() => restoreVersion(v.id))}>Restore</button>
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <section className="ed-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={t.cover_url} alt="" />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{t.series || "Title"}</div>
          <h1>{t.title}</h1>
          <div className="chips">{chips.map(([ok, l]) => <span key={l} className={`chip ${ok ? "" : "off"}`}>{ok ? "✓" : "○"} {l}</span>)}</div>
        </div>
        <div className="row ed-actions">
          <span className="seg" role="group" aria-label="Status">
            <button type="button" aria-pressed={t.status === "live"} disabled={pending} onClick={() => start(() => setStatus(t.id, "live"))}>Live</button>
            <button type="button" aria-pressed={t.status === "draft"} disabled={pending} onClick={() => start(() => setStatus(t.id, "draft"))}>Draft</button>
          </span>
          <a className="btn sm ghost" href={`/library/${t.slug}`} target="_blank" rel="noopener">Preview as student</a>
        </div>
      </section>

      <div className="ed">
        <nav className="snav" aria-label="Sections">
          {SECTIONS.map(([k, l]) => <button key={k} type="button" aria-current={sec === k} onClick={() => go(k)}>{l}</button>)}
        </nav>

        <div className="epane">
          {sec === "details" && (
            <>
              <h2 className="ph2">Details</h2>
              <div className="grid2">
                <Field label="Title" value={t.title} onSave={(v) => updateTitle(t.id, { title: v })} />
                <Field label="Subtitle" value={t.subtitle} onSave={(v) => updateTitle(t.id, { subtitle: v })} />
                <Field label="Series or edition" value={t.series} placeholder="e.g. The 1 Hour Series™" onSave={(v) => updateTitle(t.id, { series: v })} />
                <Field label="Course name" value={t.course_name} onSave={(v) => updateTitle(t.id, { course_name: v })} />
                <Field label="Link name" value={t.slug} hint={`library.theanywhereadvisor.com/library/${t.slug} · also used in GHL tags`} onSave={(v) => updateTitle(t.id, { slug: v })} />
              </div>
              <Field label="One-line description" area value={t.description} placeholder="Shown on the library page under the title" onSave={(v) => updateTitle(t.id, { description: v })} />
              <div className="danger-zone">
                <div><b>Delete this title</b><div className="muted">Removes it, its chapters, lessons and student progress. Students who own it lose access.</div></div>
                {confirmDelete ? (
                  <span className="row"><button type="button" className="btn sm ghost" onClick={() => setConfirmDelete(false)}>Keep it</button><button type="button" className="btn sm danger" onClick={() => start(() => deleteTitle(t.id))}>Delete permanently</button></span>
                ) : <button type="button" className="btn sm" onClick={() => setConfirmDelete(true)}>Delete title</button>}
              </div>
            </>
          )}

          {sec === "cover" && (
            <>
              <h2 className="ph2">Cover</h2>
              <div className="cover-ed">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.cover_url} alt={`${t.title} cover`} />
                <div className="stack">
                  <p className="muted">Upload the front cover only (JPG or PNG), at least 1600 × 2400 px. Every cover shows at the same size in the library.</p>
                  <UploadButton target={{ kind: "cover", titleId: t.id }} label={t.has_cover ? "Replace cover" : "Upload cover"} accept="image/*" primary />
                </div>
              </div>
            </>
          )}

          {sec === "ebook" && (
            <>
              <h2 className="ph2">Ebook</h2>
              <p className="muted">Students read the PDF in their browser or download it. Replace it any time; the old version is kept below.</p>
              {(["ebook_pdf", "ebook_epub"] as const).map((k) => {
                const c = cur(k);
                return (
                  <div className="erow" key={k}>
                    <span className="n">{k === "ebook_pdf" ? "PDF" : "EPUB"}</span>
                    <div className="ecol">
                      <b>{k === "ebook_pdf" ? "Ebook PDF" : "Ebook EPUB (optional, for Kindle & Apple Books)"}</b>
                      <FileLine file={c?.file ?? null} preview={c?.file ? `/api/media/file/${c.file.id}` : undefined} />
                    </div>
                    <UploadButton target={{ kind: k, titleId: t.id }} label={c ? "Replace" : "Upload"} accept={k === "ebook_pdf" ? "application/pdf,.pdf" : ".epub,application/epub+zip"} primary={!c} />
                  </div>
                );
              })}
              {versionsBlock("ebook_pdf", "PDF")}
              {versionsBlock("ebook_epub", "EPUB")}
            </>
          )}

          {sec === "audio" && (
            <>
              <h2 className="ph2">Audiobook</h2>
              <p className="muted">One MP3 or M4A per chapter. Replacing a file keeps every student's place and notes. Everything before the track named “Chapter 1” is the free sample (title, dedication, introduction…).</p>
              <DropZone
                accept="audio/*,.mp3,.m4a,.m4b,.wav"
                target={(i) => (data.chapters[i] ? { kind: "chapter", titleId: t.id, itemId: data.chapters[i].id } : { kind: "chapter-new", titleId: t.id })}
              >
                <b>Bulk upload</b>
                <span className="muted">Drop all chapter files here. They fill the chapters in filename order (01-intro.mp3, 02-…); extra files become new chapters named after the file.</span>
              </DropZone>
              <div className="rows">
                {data.chapters.map((c, i) => (
                  <div className="erow" key={c.id}>
                    <span className="n">{trackNo(c.position)}</span>
                    <div className="ecol">
                      <Field value={c.name} label={undefined} placeholder="Chapter title" onSave={(v) => updateItem("chapters", c.id, { name: v })} />
                      <FileLine file={c.file} preview={c.file ? `/api/media/chapter/${c.id}` : undefined} onRemove={c.file ? () => start(() => removeFile({ kind: "chapter", itemId: c.id })) : undefined} />
                      <Field value={c.cta} placeholder="Call-to-action when this chapter ends (optional), e.g. Want help building yours? Book a call." onSave={(v) => updateItem("chapters", c.id, { cta: v })} />
                    </div>
                    <div className="eact">
                      <UploadButton target={{ kind: "chapter", titleId: t.id, itemId: c.id }} label={c.file ? "Replace" : "Upload"} accept="audio/*,.mp3,.m4a,.m4b,.wav" primary={!c.file} />
                      <RowTools table="chapters" id={c.id} i={i} n={data.chapters.length} />
                    </div>
                  </div>
                ))}
              </div>
              <AddButton table="chapters" titleId={t.id} label="Add chapter" />
            </>
          )}

          {sec === "workbook" && (
            <>
              <h2 className="ph2">Workbook</h2>
              <p className="muted">Exercises students fill in online, each tied to a chapter. Add a printable PDF for students who like paper.</p>
              <div className="erow">
                <span className="n">PDF</span>
                <div className="ecol"><b>Printable workbook</b><FileLine file={cur("workbook_pdf")?.file ?? null} preview={cur("workbook_pdf")?.file ? `/api/media/file/${cur("workbook_pdf")!.file!.id}` : undefined} /></div>
                <UploadButton target={{ kind: "workbook_pdf", titleId: t.id }} label={cur("workbook_pdf") ? "Replace" : "Upload"} accept="application/pdf,.pdf" />
              </div>
              {versionsBlock("workbook_pdf", "workbook")}
              <div className="rows">
                {data.exercises.map((x, i) => (
                  <div className="erow" key={x.id}>
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    <div className="ecol">
                      <Field value={x.name} placeholder="Exercise title" onSave={(v) => updateItem("exercises", x.id, { name: v })} />
                      <label className="fld">
                        <span>Goes with</span>
                        <select className="inp" defaultValue={x.chapter_id ?? ""} onChange={(e) => start(() => updateItem("exercises", x.id, { chapter_id: e.target.value || null }))}>
                          <option value="">No specific chapter</option>
                          {data.chapters.map((c) => <option key={c.id} value={c.id}>{trackNo(c.position)}. {c.name}</option>)}
                        </select>
                      </label>
                      <Field label="Questions, one per line" area value={x.questions.join("\n")} onSave={(v) => updateItem("exercises", x.id, { questions: v.split("\n").map((q) => q.trim()).filter(Boolean) })} />
                    </div>
                    <div className="eact"><RowTools table="exercises" id={x.id} i={i} n={data.exercises.length} /></div>
                  </div>
                ))}
                {!data.exercises.length && <div className="empty">No exercises yet.</div>}
              </div>
              <AddButton table="exercises" titleId={t.id} label="Add exercise" />
            </>
          )}

          {sec === "course" && (
            <>
              <h2 className="ph2">Course</h2>
              <div className="grid2"><Field label="Course name" value={t.course_name} onSave={(v) => updateTitle(t.id, { course_name: v })} /></div>
              <p className="muted">Upload each lesson video (up to 50 MB), or paste a link from Vimeo, Wistia, Bunny or YouTube (unlisted) for longer videos. Lesson 1 is a free preview.</p>
              <div className="rows">
                {data.lessons.map((l, i) => (
                  <div className="erow" key={l.id}>
                    <span className="n">{l.is_bonus ? "Bonus" : i + 1}</span>
                    <div className="ecol">
                      <Field value={l.name} placeholder="Lesson title" onSave={(v) => updateItem("lessons", l.id, { name: v })} />
                      {l.file ? <FileLine file={l.file} preview={`/api/media/lesson/${l.id}`} onRemove={() => start(() => removeFile({ kind: "lesson", itemId: l.id }))} />
                        : l.video_url ? <span className="okf">✓ Linked video</span> : <span className="miss">No video yet</span>}
                      <div className="grid2 tight">
                        <Field value={l.video_url} placeholder="…or paste a video link" onSave={(v) => updateItem("lessons", l.id, { video_url: v })} />
                        <Field type="number" value={Math.round((l.duration_seconds ?? 0) / 60) || ""} placeholder="Minutes" onSave={(v) => updateItem("lessons", l.id, { duration_seconds: Number(v) * 60 })} />
                      </div>
                      <label className="check"><input type="checkbox" defaultChecked={l.is_bonus} onChange={(e) => start(() => updateItem("lessons", l.id, { is_bonus: e.target.checked }))} /> Bonus lesson</label>
                    </div>
                    <div className="eact">
                      <UploadButton target={{ kind: "lesson", titleId: t.id, itemId: l.id }} label={l.file ? "Replace" : "Upload"} accept="video/*" primary={!l.file && !l.video_url} />
                      <RowTools table="lessons" id={l.id} i={i} n={data.lessons.length} />
                    </div>
                  </div>
                ))}
              </div>
              <AddButton table="lessons" titleId={t.id} label="Add lesson" />
            </>
          )}

          {sec === "resources" && (
            <>
              <h2 className="ph2">Resources</h2>
              <p className="muted">Templates, checklists and AI prompt packs. Students who own the book can download them.</p>
              <div className="rows">
                {data.resources.map((r, i) => (
                  <div className="erow" key={r.id}>
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    <div className="ecol">
                      <Field value={r.name} placeholder="Resource name" onSave={(v) => updateItem("resources", r.id, { name: v })} />
                      <FileLine file={r.file} preview={r.file ? `/api/media/resource/${r.id}` : undefined} />
                    </div>
                    <div className="eact">
                      <UploadButton target={{ kind: "resource", titleId: t.id, itemId: r.id }} label={r.file ? "Replace" : "Upload"} accept="*/*" primary={!r.file} />
                      <RowTools table="resources" id={r.id} i={i} n={data.resources.length} />
                    </div>
                  </div>
                ))}
                {!data.resources.length && <div className="empty">No resources yet.</div>}
              </div>
              <AddButton table="resources" titleId={t.id} label="Add resource" />
            </>
          )}

          {sec === "offers" && (
            <>
              <h2 className="ph2">Offers &amp; GoHighLevel</h2>
              <p className="muted">Connect this title to your GHL products so purchases unlock it automatically, and so locked students see your offer.</p>
              <div className="grid2">
                <Field label="GHL product ID: book" value={t.ghl_book_product_id} onSave={(v) => updateTitle(t.id, { ghl_book_product_id: v })} />
                <Field label="GHL product ID: course" value={t.ghl_course_product_id} onSave={(v) => updateTitle(t.id, { ghl_course_product_id: v })} />
                <Field label="Order page (unlock button)" value={t.ghl_order_url} placeholder="https://…" onSave={(v) => updateTitle(t.id, { ghl_order_url: v })} />
                <Field label="Sales page" value={t.sales_url} placeholder="https://…" onSave={(v) => updateTitle(t.id, { sales_url: v })} />
              </div>
              <div className="panel">
                <b>GHL workflow webhook for this title</b>
                <p className="muted">URL: <code>https://library.theanywhereadvisor.com/api/ghl/purchase?secret=…</code> · Custom data: <code>title = {t.slug}</code>, <code>grant = book</code>, <code>course</code> or <code>both</code></p>
                <b>Tags this title sends to GHL</b>
                <ul className="taglist">
                  <li><code>aa-{t.slug}-owner</code> bought the book</li><li><code>aa-{t.slug}-course</code> bought the course</li>
                  <li><code>aa-{t.slug}-started</code> started listening</li><li><code>aa-{t.slug}-ch05-complete</code> finished a chapter</li>
                  <li><code>aa-{t.slug}-audiobook-finished</code> finished the audiobook</li><li><code>aa-{t.slug}-workbook-ex05-complete</code> finished an exercise</li>
                  <li><code>aa-{t.slug}-course-lesson05-complete</code> finished a lesson</li><li><code>aa-{t.slug}-course-finished</code> finished the course</li>
                </ul>
              </div>
            </>
          )}

          {sec === "history" && (
            <>
              <h2 className="ph2">History</h2>
              {data.changes.length ? (
                <ol className="chapters">{data.changes.map((c) => <li key={c.id}><span className="n">{day(c.created_at)}</span><span>{c.summary}</span><span /></li>)}</ol>
              ) : <div className="empty">No changes yet.</div>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
