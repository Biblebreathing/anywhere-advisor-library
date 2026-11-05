"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/session";

type ListTable = "chapters" | "exercises" | "lessons" | "resources";
const LISTS: ListTable[] = ["chapters", "exercises", "lessons", "resources"];

async function ctx() {
  const staff = await requireStaff();
  const db = await createClient(); // acts as the staff member; row-level security allows staff writes
  return { staff, db };
}
async function log(titleId: string | null, summary: string, actorId: string) {
  const db = await createClient();
  await db.from("change_log").insert({ title_id: titleId, actor_id: actorId, summary });
}
function refresh(titleId?: string) {
  revalidatePath("/admin");
  if (titleId) revalidatePath(`/admin/titles/${titleId}`);
  revalidatePath("/library", "layout");
  revalidatePath("/");
}
function fail(message: string): never {
  throw new Error(message);
}

/* ---------------- titles ---------------- */

export async function createTitle() {
  const { staff, db } = await ctx();
  const slug = `new-title-${Math.random().toString(36).slice(2, 6)}`;
  const { data: max } = await db.from("titles").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data: t, error } = await db
    .from("titles")
    .insert({ slug, title: "Untitled book", subtitle: "for Financial Advisors", status: "draft", course_name: "Untitled course", sort_order: (max?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !t) fail(error?.message ?? "Could not create the title");
  await db.from("chapters").insert({ title_id: t.id, position: 0, name: "Introduction" });
  await db.from("lessons").insert({ title_id: t.id, position: 0, name: "Welcome & how to use this course" });
  await log(t.id, "Created title", staff.id);
  refresh();
  redirect(`/admin/titles/${t.id}`);
}

const TITLE_FIELDS = ["title", "subtitle", "series", "description", "course_name", "slug", "ghl_book_product_id", "ghl_course_product_id", "ghl_order_url", "sales_url", "sort_order"] as const;

export async function updateTitle(id: string, patch: Partial<Record<(typeof TITLE_FIELDS)[number], string | number | null>>) {
  const { staff, db } = await ctx();
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of TITLE_FIELDS) if (k in patch) clean[k] = patch[k] === "" ? null : patch[k];
  if ("title" in clean && !clean.title) fail("The title can't be empty");
  if ("slug" in clean) {
    const s = String(clean.slug ?? "").toLowerCase().trim();
    if (!/^[a-z0-9-]{2,40}$/.test(s)) fail("The link name can only use lowercase letters, numbers and dashes");
    clean.slug = s;
  }
  const { error } = await db.from("titles").update(clean).eq("id", id);
  if (error) fail(error.message.includes("duplicate") ? "Another title already uses that link name" : error.message);
  if ("slug" in clean || "title" in clean) await log(id, "Edited details", staff.id);
  refresh(id);
}

export async function setStatus(id: string, status: "draft" | "live") {
  const { staff, db } = await ctx();
  await db.from("titles").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  await log(id, status === "live" ? "Published" : "Moved to draft", staff.id);
  refresh(id);
}

export async function deleteTitle(id: string) {
  const { staff, db } = await ctx();
  const { data: t } = await db.from("titles").select("title").eq("id", id).single();
  const { error } = await db.from("titles").delete().eq("id", id);
  if (error) fail(error.message);
  await log(null, `Deleted title “${t?.title ?? ""}”`, staff.id);
  refresh();
  redirect("/admin");
}

/* ---------------- chapters / exercises / lessons / resources ---------------- */

const DEFAULTS: Record<ListTable, (n: number) => Record<string, unknown>> = {
  chapters: (n) => ({ name: `Chapter ${n}` }),
  exercises: () => ({ name: "New exercise", questions: ["Your question"] }),
  lessons: (n) => ({ name: `Lesson ${n + 1}` }),
  resources: () => ({ name: "New resource" }),
};
const ITEM_FIELDS: Record<ListTable, string[]> = {
  chapters: ["name", "cta"],
  exercises: ["name", "chapter_id", "questions"],
  lessons: ["name", "video_url", "duration_seconds", "is_bonus"],
  resources: ["name"],
};
const LABEL: Record<ListTable, string> = { chapters: "chapter", exercises: "exercise", lessons: "lesson", resources: "resource" };

async function renumber(db: Awaited<ReturnType<typeof createClient>>, table: ListTable, titleId: string, order?: string[]) {
  const { data } = await db.from(table).select("id").eq("title_id", titleId).order("position");
  const ids = order ?? (data ?? []).map((r) => r.id as string);
  await Promise.all(ids.map((id, i) => db.from(table).update({ position: i }).eq("id", id)));
}

export async function addItem(table: ListTable, titleId: string, extra: Record<string, unknown> = {}) {
  if (!LISTS.includes(table)) fail("Unknown list");
  const { staff, db } = await ctx();
  const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("title_id", titleId);
  const n = count ?? 0;
  const { data, error } = await db.from(table).insert({ title_id: titleId, position: n, ...DEFAULTS[table](n), ...extra }).select("id").single();
  if (error) fail(error.message);
  await log(titleId, `Added a ${LABEL[table]}`, staff.id);
  refresh(titleId);
  return data!.id as string;
}

export async function updateItem(table: ListTable, id: string, patch: Record<string, unknown>) {
  if (!LISTS.includes(table)) fail("Unknown list");
  const { db } = await ctx();
  const clean: Record<string, unknown> = {};
  for (const k of ITEM_FIELDS[table]) if (k in patch) clean[k] = patch[k] === "" ? null : patch[k];
  if (table === "lessons" && "video_url" in clean && clean.video_url) clean.video_file_id = null;
  if (table === "lessons" && "duration_seconds" in clean) clean.duration_seconds = Math.max(60, Number(clean.duration_seconds) || 60);
  const { data, error } = await db.from(table).update(clean).eq("id", id).select("title_id").single();
  if (error) fail(error.message);
  refresh(data.title_id);
}

export async function moveItem(table: ListTable, id: string, dir: -1 | 1) {
  if (!LISTS.includes(table)) fail("Unknown list");
  const { db } = await ctx();
  const { data: row } = await db.from(table).select("title_id").eq("id", id).single();
  if (!row) return;
  const { data } = await db.from(table).select("id").eq("title_id", row.title_id).order("position");
  const ids = (data ?? []).map((r) => r.id as string);
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await renumber(db, table, row.title_id, ids);
  refresh(row.title_id);
}

export async function deleteItem(table: ListTable, id: string) {
  if (!LISTS.includes(table)) fail("Unknown list");
  const { staff, db } = await ctx();
  const { data: row } = await db.from(table).select("title_id").eq("id", id).single();
  if (!row) return;
  if (table === "chapters" || table === "lessons") {
    const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("title_id", row.title_id);
    if ((count ?? 0) <= 1) fail(`A title needs at least one ${LABEL[table]}`);
  }
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) fail(error.message);
  await renumber(db, table, row.title_id);
  await log(row.title_id, `Removed a ${LABEL[table]}`, staff.id);
  refresh(row.title_id);
}

/* ---------------- uploads ---------------- */

export type UploadTarget =
  | { kind: "cover"; titleId: string }
  | { kind: "ebook_pdf" | "ebook_epub" | "workbook_pdf"; titleId: string }
  | { kind: "chapter"; titleId: string; itemId: string }
  | { kind: "chapter-new"; titleId: string }
  | { kind: "lesson"; titleId: string; itemId: string }
  | { kind: "resource"; titleId: string; itemId: string }
  | { kind: "welcome" };

export type UploadedFile = { bucket: "covers" | "media"; path: string; name: string; size: number; mime: string; duration?: number | null };

const KIND_LABEL: Record<string, string> = {
  cover: "cover", ebook_pdf: "ebook PDF", ebook_epub: "ebook EPUB", workbook_pdf: "printable workbook",
  chapter: "chapter audio", "chapter-new": "chapter audio", lesson: "lesson video", resource: "resource", welcome: "welcome video",
};

/** Called by the browser after a file finishes uploading to storage: records it and attaches it to its place. */
export async function registerUpload(target: UploadTarget, file: UploadedFile) {
  const { staff, db } = await ctx();
  const prefix = target.kind === "welcome" ? "site/" : `titles/${target.titleId}/`;
  if (!file.path.startsWith(prefix)) fail("Upload went to the wrong folder");

  if (target.kind === "cover") {
    const { data: old } = await db.from("titles").select("cover_path").eq("id", target.titleId).single();
    await db.from("titles").update({ cover_path: file.path, updated_at: new Date().toISOString() }).eq("id", target.titleId);
    await log(target.titleId, `${old?.cover_path ? "Replaced" : "Uploaded"} cover · ${file.name}`, staff.id);
    refresh(target.titleId);
    return;
  }

  const { data: f, error } = await db
    .from("files")
    .insert({ bucket: file.bucket, path: file.path, name: file.name, size_bytes: file.size, mime_type: file.mime, duration_seconds: file.duration ?? null, uploaded_by: staff.id })
    .select("id")
    .single();
  if (error || !f) fail(error?.message ?? "Could not save the file");
  let replaced = false;

  switch (target.kind) {
    case "ebook_pdf":
    case "ebook_epub":
    case "workbook_pdf": {
      const { data: cur } = await db.from("title_files").select("id").eq("title_id", target.titleId).eq("kind", target.kind).eq("is_current", true);
      replaced = !!cur?.length;
      await db.from("title_files").update({ is_current: false }).eq("title_id", target.titleId).eq("kind", target.kind);
      await db.from("title_files").insert({ title_id: target.titleId, kind: target.kind, file_id: f.id, is_current: true });
      break;
    }
    case "chapter": {
      const { data: c } = await db.from("chapters").select("audio_file_id").eq("id", target.itemId).single();
      replaced = !!c?.audio_file_id;
      await db.from("chapters").update({ audio_file_id: f.id, ...(file.duration ? { duration_seconds: file.duration } : {}) }).eq("id", target.itemId);
      break;
    }
    case "chapter-new": {
      const { count } = await db.from("chapters").select("id", { count: "exact", head: true }).eq("title_id", target.titleId);
      const name = file.name.replace(/\.[^.]+$/, "").replace(/^[\d\s._-]+/, "").replace(/[-_]+/g, " ").trim() || `Chapter ${count ?? 0}`;
      await db.from("chapters").insert({ title_id: target.titleId, position: count ?? 0, name, audio_file_id: f.id, duration_seconds: file.duration ?? null });
      break;
    }
    case "lesson": {
      const { data: l } = await db.from("lessons").select("video_file_id, video_url").eq("id", target.itemId).single();
      replaced = !!(l?.video_file_id || l?.video_url);
      await db.from("lessons").update({ video_file_id: f.id, video_url: null, ...(file.duration ? { duration_seconds: file.duration } : {}) }).eq("id", target.itemId);
      break;
    }
    case "resource": {
      const { data: r } = await db.from("resources").select("file_id, name").eq("id", target.itemId).single();
      replaced = !!r?.file_id;
      const name = !r?.name || r.name === "New resource" ? file.name.replace(/\.[^.]+$/, "") : r.name;
      await db.from("resources").update({ file_id: f.id, name }).eq("id", target.itemId);
      break;
    }
    case "welcome": {
      const { data: s } = await db.from("site_settings").select("welcome_video_file_id").eq("id", 1).single();
      replaced = !!s?.welcome_video_file_id;
      await db.from("site_settings").update({ welcome_video_file_id: f.id, updated_at: new Date().toISOString() }).eq("id", 1);
      break;
    }
  }
  await log(target.kind === "welcome" ? null : target.titleId, `${replaced ? "Replaced" : "Uploaded"} ${KIND_LABEL[target.kind]} · ${file.name}`, staff.id);
  refresh(target.kind === "welcome" ? undefined : target.titleId);
}

export async function restoreVersion(titleFileId: string) {
  const { staff, db } = await ctx();
  const { data: tf } = await db.from("title_files").select("title_id, kind, files(name)").eq("id", titleFileId).single();
  if (!tf) fail("Version not found");
  await db.from("title_files").update({ is_current: false }).eq("title_id", tf.title_id).eq("kind", tf.kind);
  await db.from("title_files").update({ is_current: true }).eq("id", titleFileId);
  await log(tf.title_id, `Restored ${KIND_LABEL[tf.kind]} · ${(tf.files as any)?.name ?? ""}`, staff.id);
  refresh(tf.title_id);
}

export async function removeFile(target: { kind: "chapter" | "lesson" | "resource"; itemId: string }) {
  const { db } = await ctx();
  const table = target.kind === "chapter" ? "chapters" : target.kind === "lesson" ? "lessons" : "resources";
  const col = target.kind === "chapter" ? "audio_file_id" : target.kind === "lesson" ? "video_file_id" : "file_id";
  const { data } = await db.from(table).update({ [col]: null }).eq("id", target.itemId).select("title_id").single();
  refresh(data?.title_id);
}

/* ---------------- site + students ---------------- */

export async function updateSite(patch: { booking_url?: string | null; welcome_video_url?: string | null }) {
  const { db } = await ctx();
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("booking_url" in patch) clean.booking_url = patch.booking_url || null;
  if ("welcome_video_url" in patch) {
    clean.welcome_video_url = patch.welcome_video_url || null;
    if (patch.welcome_video_url) clean.welcome_video_file_id = null;
  }
  await db.from("site_settings").update(clean).eq("id", 1);
  refresh();
}

export async function setAccess(userId: string, titleId: string, kind: "book" | "course", on: boolean) {
  const { staff } = await ctx();
  const db = createAdminClient();
  if (on) {
    const rows = [{ user_id: userId, title_id: titleId, kind, source: "admin" }];
    if (kind === "course") rows.push({ user_id: userId, title_id: titleId, kind: "book", source: "admin" });
    await db.from("entitlements").upsert(rows, { onConflict: "user_id,title_id,kind", ignoreDuplicates: true });
  } else {
    await db.from("entitlements").delete().eq("user_id", userId).eq("title_id", titleId).eq("kind", kind);
  }
  const { data: p } = await db.from("profiles").select("email").eq("id", userId).single();
  await log(titleId, `${on ? "Gave" : "Removed"} ${kind} access ${on ? "to" : "from"} ${p?.email}`, staff.id);
  revalidatePath("/admin/students");
}
