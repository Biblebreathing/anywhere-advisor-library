import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/session";
import type { Title } from "@/lib/catalog";
import { Cover } from "./Cover";

async function enterLibrary() {
  "use server";
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/library");
  await supabase.from("profiles").update({ welcomed_at: new Date().toISOString() }).eq("id", data.user.id).is("welcomed_at", null);
  await supabase.from("events").insert({ user_id: data.user.id, name: "library-entered", ghl_tag: "library-entered" });
  redirect("/library");
}

async function welcomeVideoUrl(): Promise<string | null> {
  const db = createAdminClient();
  const { data: s } = await db.from("site_settings").select("welcome_video_url, welcome_video_file_id").eq("id", 1).maybeSingle();
  if (s?.welcome_video_file_id) {
    const { data: f } = await db.from("files").select("bucket, path").eq("id", s.welcome_video_file_id).maybeSingle();
    if (f) {
      const { data } = await db.storage.from(f.bucket).createSignedUrl(f.path, 60 * 60 * 6);
      if (data?.signedUrl) return data.signedUrl;
    }
  }
  return s?.welcome_video_url ?? null;
}

export async function WelcomeView() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: titles } = await supabase
    .from("titles")
    .select("id, slug, title, subtitle, series, cover_path")
    .eq("status", "live")
    .order("sort_order");
  const video = await welcomeVideoUrl();
  const back = !!profile?.welcomed_at;

  return (
    <main>
      <section className="wel">
        <div>
          <div className="eyebrow">The Anywhere Advisor Library</div>
          <h1>Welcome to your <em>library</em></h1>
          <p className="lede">
            Books, courses and resources that help financial advisors build authority, run one-to-many marketing and book
            more appointments with AI, from anywhere.
          </p>
          <form action={enterLibrary} className="row">
            <button className="btn gold" type="submit">{back ? "Back to my library" : "Enter the library"}</button>
          </form>
          {!back && (
            <form action={enterLibrary}>
              <button className="skip" type="submit">Already a student? Skip the intro →</button>
            </form>
          )}
        </div>
        <div className="wvid">
          {video ? (
            <video controls playsInline preload="metadata" src={video} />
          ) : (
            <div className="vin">
              <span className="eyebrow">Welcome video</span>
              <b>A welcome from Terrance McMahon</b>
              <span className="muted">Upload it in Admin → Site settings</span>
            </div>
          )}
        </div>
      </section>

      <section className="block">
        <div className="sec-head"><h2>The collection</h2><span className="muted">Every title: PDF · audiobook · workbook · course</span></div>
        <div className="wcoll">
          {(titles as Title[] | null)?.map((t) => (
            <div key={t.id}>
              <Cover t={t} />
              <span>
                <span className="eyebrow">{t.series}</span>
                <b>{t.title}</b>
                <span className="muted" style={{ fontSize: 13 }}>{t.subtitle}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
