import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/session";
import { AdminNav } from "@/components/admin/AdminNav";
import { SiteSettings } from "@/components/admin/SiteSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site settings · Admin" };

export default async function SettingsPage() {
  await requireStaff();
  const db = await createClient();
  const { data: s } = await db
    .from("site_settings")
    .select("booking_url, welcome_video_url, welcome:files(id, name, size_bytes, duration_seconds, created_at)")
    .eq("id", 1)
    .maybeSingle();
  return (
    <main>
      <section style={{ paddingBlock: "28px 8px" }}>
        <AdminNav current="settings" />
        <h1 className="display">Site settings</h1>
      </section>
      <SiteSettings bookingUrl={s?.booking_url ?? ""} welcomeUrl={s?.welcome_video_url ?? ""} welcome={(s?.welcome as any) ?? null} />
    </main>
  );
}
