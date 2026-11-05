import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/track";

/** POST { tag: "aa-webinar-ch04-complete", titleId?, data? } from the student's browser. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { tag?: string; titleId?: string; data?: Record<string, unknown> };
  const ok = await trackEvent(auth.user.id, String(body.tag ?? ""), { titleId: body.titleId ?? null, data: body.data });
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
