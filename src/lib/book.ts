import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coverUrl, freeTrackCount } from "@/lib/catalog";

export type BookChapter = { id: string; position: number; name: string; duration: number; hasAudio: boolean; cta: string | null; free: boolean };
export type BookAudio = {
  titleId: string; slug: string; title: string; cover: string; owned: boolean; bookingUrl: string | null; orderUrl: string | null;
  chapters: BookChapter[];
};
export type BookData = {
  audio: BookAudio;
  title: { id: string; slug: string; title: string; subtitle: string | null; series: string | null; description: string | null; course_name: string | null; status: string };
  ownsBook: boolean; ownsCourse: boolean;
  progress: { chapter_id: string; position_seconds: number } | null;
  chaptersDone: string[];
  lessons: { id: string; position: number; name: string; duration: number; is_bonus: boolean; hasVideo: boolean; video_url: string | null }[];
  lessonsDone: string[];
  exercises: { id: string; position: number; name: string; chapter_id: string | null; questions: string[] }[];
  answers: Record<string, { answers: string[]; completed_at: string | null }>;
  resources: { id: string; name: string; hasFile: boolean }[];
  files: { ebook: boolean; epub: boolean; workbook: boolean };
  notes: { id: string; chapter_id: string; position_seconds: number; body: string; created_at: string }[];
};

type ChapterRow = { id: string; position: number; name: string; duration_seconds: number | null; audio_file_id: string | null; cta: string | null };
export function toChapters(rows: ChapterRow[]): BookChapter[] {
  const free = freeTrackCount(rows.map((r) => r.name));
  return rows.map((c, i) => ({ id: c.id, position: c.position, name: c.name, duration: Number(c.duration_seconds ?? 0), hasAudio: !!c.audio_file_id, cta: c.cta, free: i < free }));
}

/** Everything a student page needs for one title, read as the student (row-level security applies). */
export async function loadBook(slug: string, userId: string): Promise<BookData> {
  const db = await createClient();
  const { data: t } = await db
    .from("titles")
    .select("id, slug, title, subtitle, series, description, course_name, status, cover_path, ghl_order_url, sales_url")
    .eq("slug", slug)
    .maybeSingle();
  if (!t) notFound();

  const [ch, ls, ex, rs, ents, prog, chDone, lsDone, ans, tf, site] = await Promise.all([
    db.from("chapters").select("id, position, name, duration_seconds, audio_file_id, cta").eq("title_id", t.id).order("position"),
    db.from("lessons").select("id, position, name, duration_seconds, is_bonus, video_file_id, video_url").eq("title_id", t.id).order("position"),
    db.from("exercises").select("id, position, name, chapter_id, questions").eq("title_id", t.id).order("position"),
    db.from("resources").select("id, name, file_id").eq("title_id", t.id).order("position"),
    db.from("entitlements").select("kind").eq("user_id", userId).eq("title_id", t.id),
    db.from("audio_progress").select("chapter_id, position_seconds").eq("user_id", userId).eq("title_id", t.id).maybeSingle(),
    db.from("chapter_completions").select("chapter_id, chapters!inner(title_id)").eq("user_id", userId).eq("chapters.title_id", t.id),
    db.from("lesson_completions").select("lesson_id, lessons!inner(title_id)").eq("user_id", userId).eq("lessons.title_id", t.id),
    db.from("exercise_answers").select("exercise_id, answers, completed_at, exercises!inner(title_id)").eq("user_id", userId).eq("exercises.title_id", t.id),
    // title_files is staff-only; the server only checks which files exist (the media route guards the files themselves).
    createAdminClient().from("title_files").select("kind").eq("title_id", t.id).eq("is_current", true),
    db.from("site_settings").select("booking_url").eq("id", 1).maybeSingle(),
  ]);

  const ownsCourse = !!ents.data?.some((e) => e.kind === "course");
  const ownsBook = ownsCourse || !!ents.data?.some((e) => e.kind === "book");
  const chapterIds = (ch.data ?? []).map((c) => c.id);
  const { data: notes } = chapterIds.length
    ? await db.from("notes").select("id, chapter_id, position_seconds, body, created_at").eq("user_id", userId).in("chapter_id", chapterIds).order("position_seconds")
    : { data: [] };
  const kinds: string[] = Array.isArray(tf.data) ? (tf.data as { kind: string }[]).map((r) => r.kind) : [];

  return {
    audio: {
      titleId: t.id, slug: t.slug, title: t.title, cover: coverUrl(t), owned: ownsBook,
      bookingUrl: site.data?.booking_url ?? null, orderUrl: t.ghl_order_url || t.sales_url || null,
      chapters: toChapters(ch.data ?? []),
    },
    title: { id: t.id, slug: t.slug, title: t.title, subtitle: t.subtitle, series: t.series, description: t.description, course_name: t.course_name, status: t.status },
    ownsBook, ownsCourse,
    progress: prog.data ? { chapter_id: prog.data.chapter_id, position_seconds: Number(prog.data.position_seconds) } : null,
    chaptersDone: (chDone.data ?? []).map((r) => r.chapter_id),
    lessons: (ls.data ?? []).map((l) => ({ id: l.id, position: l.position, name: l.name, duration: Number(l.duration_seconds ?? 0), is_bonus: l.is_bonus, hasVideo: !!(l.video_file_id || l.video_url), video_url: l.video_url })),
    lessonsDone: (lsDone.data ?? []).map((r) => r.lesson_id),
    exercises: (ex.data ?? []) as BookData["exercises"],
    answers: Object.fromEntries((ans.data ?? []).map((a) => [a.exercise_id, { answers: (a.answers as string[]) ?? [], completed_at: a.completed_at }])),
    resources: (rs.data ?? []).map((r) => ({ id: r.id, name: r.name, hasFile: !!r.file_id })),
    files: { ebook: kinds.includes("ebook_pdf"), epub: kinds.includes("ebook_epub"), workbook: kinds.includes("workbook_pdf") },
    notes: (notes ?? []).map((n) => ({ ...n, position_seconds: Number(n.position_seconds) })),
  };
}
