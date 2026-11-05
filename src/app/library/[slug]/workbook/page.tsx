import { getProfile } from "@/lib/session";
import { loadBook } from "@/lib/book";
import { Workbook } from "@/components/Workbook";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workbook · The Anywhere Advisor Library" };

export default async function WorkbookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getProfile();
  const d = await loadBook(slug, profile!.id);
  return <Workbook d={d} userId={profile!.id} />;
}
