import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { loadBook } from "@/lib/book";

export const dynamic = "force-dynamic";

/** /library/:slug/course opens the first lesson the student hasn't finished. */
export default async function CourseIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getProfile();
  const d = await loadBook(slug, profile!.id);
  const next = d.lessons.find((l) => !d.lessonsDone.includes(l.id)) ?? d.lessons[0];
  if (!next) notFound();
  redirect(`/library/${slug}/course/${next.id}`);
}
