import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrackCount } from "@/lib/catalog";

/**
 * Hands out a short-lived signed link to a private file, after checking the student may have it.
 *
 *   /api/media/chapter/:chapterId      audiobook track (tracks before "Chapter 1" are the free sample)
 *   /api/media/lesson/:lessonId        course video (first lesson is a free preview)
 *   /api/media/resource/:resourceId    template / checklist / prompt pack
 *   /api/media/ebook/:titleId          current ebook PDF
 *   /api/media/workbook/:titleId       current printable workbook PDF
 *   /api/media/file/:fileId            staff preview of any uploaded file
 *   /api/media/welcome/site            the welcome video
 *
 * Add ?dl=1 to download instead of opening in the browser.
 */
type Kind = "chapter" | "lesson" | "resource" | "ebook" | "workbook" | "file" | "welcome";

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = (await params) as { kind: Kind; id: string };
  const download = req.nextUrl.searchParams.get("dl") === "1";

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const db = createAdminClient();

  let staff = false;
  if (auth.user) {
    const { data: p } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
    staff = p?.role === "owner" || p?.role === "editor";
  }
  const owns = async (titleId: string, k: "book" | "course") => {
    if (staff) return true;
    if (!auth.user) return false;
    const { data } = await db.from("entitlements").select("kind").eq("user_id", auth.user.id).eq("title_id", titleId);
    // Owning the course includes the book.
    return !!data?.some((e) => e.kind === k || (k === "book" && e.kind === "course"));
  };
  const deny = () => NextResponse.json({ error: auth.user ? "You don't have access to this yet" : "Sign in first" }, { status: auth.user ? 403 : 401 });

  let fileId: string | null = null;
  let ttl = 60 * 60 * 6;

  if (kind === "chapter") {
    const { data: c } = await db.from("chapters").select("title_id, position, audio_file_id").eq("id", id).maybeSingle();
    if (!c?.audio_file_id) return NextResponse.json({ error: "No audio yet" }, { status: 404 });
    // The free sample is every track before "Chapter 1" (signed-in students only).
    const { data: names } = await db.from("chapters").select("name").eq("title_id", c.title_id).order("position");
    const free = c.position < freeTrackCount((names ?? []).map((n) => n.name));
    if (!(free && auth.user) && !(await owns(c.title_id, "book"))) return deny();
    fileId = c.audio_file_id;
  } else if (kind === "lesson") {
    const { data: l } = await db.from("lessons").select("title_id, position, video_file_id, video_url").eq("id", id).maybeSingle();
    if (!l) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(l.position === 0 && auth.user) && !(await owns(l.title_id, "course"))) return deny();
    if (!l.video_file_id && l.video_url) return NextResponse.redirect(l.video_url);
    fileId = l.video_file_id;
  } else if (kind === "resource") {
    const { data: r } = await db.from("resources").select("title_id, file_id").eq("id", id).maybeSingle();
    if (!r?.file_id) return NextResponse.json({ error: "No file yet" }, { status: 404 });
    if (!(await owns(r.title_id, "book"))) return deny();
    fileId = r.file_id;
    ttl = 600;
  } else if (kind === "ebook" || kind === "workbook") {
    if (!(await owns(id, "book"))) return deny();
    const { data: tf } = await db
      .from("title_files")
      .select("file_id")
      .eq("title_id", id)
      .eq("kind", kind === "ebook" ? "ebook_pdf" : "workbook_pdf")
      .eq("is_current", true)
      .maybeSingle();
    if (!tf) return NextResponse.json({ error: "No file yet" }, { status: 404 });
    fileId = tf.file_id;
    ttl = 60 * 30;
  } else if (kind === "file") {
    if (!staff) return deny();
    fileId = id;
  } else if (kind === "welcome") {
    const { data: s } = await db.from("site_settings").select("welcome_video_file_id, welcome_video_url").eq("id", 1).maybeSingle();
    if (!s?.welcome_video_file_id && s?.welcome_video_url) return NextResponse.redirect(s.welcome_video_url);
    fileId = s?.welcome_video_file_id ?? null;
  } else {
    return NextResponse.json({ error: "Unknown file type" }, { status: 404 });
  }

  if (!fileId) return NextResponse.json({ error: "No file yet" }, { status: 404 });
  const { data: f } = await db.from("files").select("bucket, path, name").eq("id", fileId).maybeSingle();
  if (!f) return NextResponse.json({ error: "File missing" }, { status: 404 });
  const { data: signed, error } = await db.storage
    .from(f.bucket)
    .createSignedUrl(f.path, ttl, download ? { download: f.name } : undefined);
  if (error || !signed) return NextResponse.json({ error: "Could not open the file" }, { status: 500 });

  const res = NextResponse.redirect(signed.signedUrl);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
