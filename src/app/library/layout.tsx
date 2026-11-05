import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { coverUrl } from "@/lib/catalog";
import type { BookAudio } from "@/lib/book";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/Player";

/** Every library page shares one audio player, so listening continues while students move around. */
export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/library");

  // Restore the most recent audiobook (paused) so the player bar is there after a refresh or a return visit.
  let resume: { book: BookAudio; index: number; position: number } | null = null;
  const db = await createClient();
  const { data: last } = await db.from("audio_progress").select("title_id, chapter_id, position_seconds").eq("user_id", profile.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (last) {
    const [{ data: t }, { data: ch }, { data: ents }, { data: site }] = await Promise.all([
      db.from("titles").select("id, slug, title, cover_path, ghl_order_url, sales_url").eq("id", last.title_id).maybeSingle(),
      db.from("chapters").select("id, position, name, duration_seconds, audio_file_id, cta").eq("title_id", last.title_id).order("position"),
      db.from("entitlements").select("kind").eq("user_id", profile.id).eq("title_id", last.title_id),
      db.from("site_settings").select("booking_url").eq("id", 1).maybeSingle(),
    ]);
    const chapters = (ch ?? []).map((c) => ({ id: c.id, position: c.position, name: c.name, duration: Number(c.duration_seconds ?? 0), hasAudio: !!c.audio_file_id, cta: c.cta }));
    const index = chapters.findIndex((c) => c.id === last.chapter_id);
    if (t && index >= 0) {
      resume = {
        book: { titleId: t.id, slug: t.slug, title: t.title, cover: coverUrl(t), owned: !!ents?.length, bookingUrl: site?.booking_url ?? null, orderUrl: t.ghl_order_url || t.sales_url, chapters },
        index, position: Number(last.position_seconds),
      };
    }
  }

  return (
    <PlayerProvider userId={profile.id} resume={resume}>
      <div className="with-player">{children}</div>
      <MiniPlayer />
    </PlayerProvider>
  );
}
