import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { addTags } from "@/lib/ghl";

/**
 * Records a student event and mirrors it to GoHighLevel as a tag on the contact.
 * Tags look like aa-webinar-ch04-complete. GHL sync is skipped when no API token is configured.
 */
export async function trackEvent(userId: string, tag: string, opts: { titleId?: string | null; data?: Record<string, unknown> } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(tag)) return false;
  const db = createAdminClient();
  const { data: ev } = await db
    .from("events")
    .insert({ user_id: userId, title_id: opts.titleId ?? null, name: tag, ghl_tag: tag, data: opts.data ?? {} })
    .select("id")
    .single();
  const { data: p } = await db.from("profiles").select("ghl_contact_id").eq("id", userId).maybeSingle();
  if (p?.ghl_contact_id && (await addTags(p.ghl_contact_id, [tag])) && ev) {
    await db.from("events").update({ ghl_synced_at: new Date().toISOString() }).eq("id", ev.id);
  }
  return true;
}
