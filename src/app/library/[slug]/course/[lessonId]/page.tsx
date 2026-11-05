import { notFound } from "next/navigation";
import { getProfile } from "@/lib/session";
import { loadBook } from "@/lib/book";
import { CoursePlayer } from "@/components/CoursePlayer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course · The Anywhere Advisor Library" };

/** Turns a Vimeo / YouTube / Wistia / Bunny link into an embeddable player address. */
function embed(url: string): { type: "embed" | "link"; src: string } {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return { type: "embed", src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?rel=0` };
    if (h.endsWith("youtube.com")) { const id = u.searchParams.get("v") ?? u.pathname.split("/").pop(); return { type: "embed", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` }; }
    if (h === "vimeo.com") { const [id, hash] = u.pathname.split("/").filter(Boolean); return { type: "embed", src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}` }; }
    if (h === "player.vimeo.com" || h === "iframe.mediadelivery.net" || h.endsWith("fast.wistia.net")) return { type: "embed", src: url };
    if (h.endsWith("wistia.com")) { const id = u.pathname.split("/").pop(); return { type: "embed", src: `https://fast.wistia.net/embed/iframe/${id}` }; }
  } catch {}
  return { type: "link", src: url };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const profile = await getProfile();
  const d = await loadBook(slug, profile!.id);
  const idx = d.lessons.findIndex((l) => l.id === lessonId);
  if (idx < 0) notFound();
  const lesson = d.lessons[idx];
  const canWatch = d.ownsCourse || idx === 0;

  const source = !canWatch
    ? ({ type: "locked" } as const)
    : !lesson.hasVideo
      ? ({ type: "none" } as const)
      : lesson.video_url
        ? embed(lesson.video_url)
        : ({ type: "file", src: `/api/media/lesson/${lesson.id}` } as const);

  return (
    <main>
      <CoursePlayer
        userId={profile!.id} slug={slug} titleId={d.title.id} title={d.title.title} courseName={d.title.course_name ?? `${d.title.title} course`}
        cover={d.audio.cover} lessons={d.lessons} done={d.lessonsDone} current={lesson.id} owned={d.ownsCourse}
        source={source} orderUrl={d.audio.orderUrl} bookingUrl={d.audio.bookingUrl}
      />
    </main>
  );
}
