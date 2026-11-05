import { getProfile } from "@/lib/session";
import { loadBook } from "@/lib/book";
import { BookView } from "@/components/BookView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug} · The Anywhere Advisor Library` };
}

export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getProfile();
  const d = await loadBook(slug, profile!.id);
  return <BookView d={d} />;
}
