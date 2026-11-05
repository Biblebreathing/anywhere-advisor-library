import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/session";
import { coverUrl } from "@/lib/catalog";
import { TitleEditor, type EditorData, type FileInfo } from "@/components/admin/TitleEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit title · Admin" };

const FILE = "id, name, size_bytes, duration_seconds, created_at";

export default async function EditTitlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { s } = await searchParams;
  const db = await createClient();

  const { data: t } = await db.from("titles").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();

  const [ch, ex, ls, rs, tf, log] = await Promise.all([
    db.from("chapters").select(`id, position, name, cta, duration_seconds, file:files(${FILE})`).eq("title_id", id).order("position"),
    db.from("exercises").select("id, position, name, chapter_id, questions").eq("title_id", id).order("position"),
    db.from("lessons").select(`id, position, name, video_url, duration_seconds, is_bonus, file:files(${FILE})`).eq("title_id", id).order("position"),
    db.from("resources").select(`id, position, name, file:files(${FILE})`).eq("title_id", id).order("position"),
    db.from("title_files").select(`id, kind, is_current, created_at, file:files(${FILE})`).eq("title_id", id).order("created_at", { ascending: false }),
    db.from("change_log").select("id, summary, created_at").eq("title_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  const data: EditorData = {
    title: { ...t, cover_url: coverUrl(t), has_cover: !!t.cover_path },
    chapters: (ch.data ?? []).map((r: any) => ({ ...r, file: r.file as FileInfo })),
    exercises: (ex.data ?? []) as EditorData["exercises"],
    lessons: (ls.data ?? []).map((r: any) => ({ ...r, file: r.file as FileInfo })),
    resources: (rs.data ?? []).map((r: any) => ({ ...r, file: r.file as FileInfo })),
    versions: (tf.data ?? []).map((r: any) => ({ ...r, file: r.file as FileInfo })),
    changes: (log.data ?? []) as EditorData["changes"],
  };

  return (
    <main>
      <p style={{ marginTop: 22 }}><Link className="muted" href="/admin">← All titles</Link></p>
      <TitleEditor data={data} initialSection={s} />
    </main>
  );
}
