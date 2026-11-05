export type Title = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  series: string | null;
  description: string | null;
  status: "draft" | "live";
  cover_path: string | null;
  course_name: string | null;
  sort_order: number;
};

export type TitleWithCounts = Title & {
  chapters: { count: number }[];
  exercises: { count: number }[];
  lessons: { count: number }[];
  resources: { count: number }[];
};

export const TITLE_WITH_COUNTS =
  "id, slug, title, subtitle, series, description, status, cover_path, course_name, sort_order, chapters(count), exercises(count), lessons(count), resources(count)";

/**
 * The free sample: everything before "Chapter 1" (title, dedication, introduction…), like an Audible sample.
 * If no track is named "Chapter 1", only the first track is free.
 */
export function freeTrackCount(names: string[]) {
  const i = names.findIndex((n) => /^chapter\s*(1|one)\b/i.test(n.trim()));
  return i > 0 ? i : 1;
}

export const count = (rel: { count: number }[] | undefined) => rel?.[0]?.count ?? 0;

/** Bundled covers live in /public/covers; uploaded ones in the public "covers" storage bucket. */
export function coverUrl(t: Pick<Title, "cover_path">) {
  const p = t.cover_path;
  if (!p) return "/covers/placeholder.svg";
  if (p.startsWith("/") || p.startsWith("http")) return p;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/covers/${p}`;
}
