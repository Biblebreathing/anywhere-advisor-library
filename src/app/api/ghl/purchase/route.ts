import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { addTags, setCustomField, tag, upsertContact } from "@/lib/ghl";

/**
 * Called by a GoHighLevel workflow "Webhook" action after a purchase.
 *
 *   POST /api/ghl/purchase?secret=GHL_WEBHOOK_SECRET
 *
 * GHL sends the contact (email, first_name, contact_id, ...). Add Custom Data to say what to unlock:
 *   title = webinar | book | atomic | all      (title slug, or "all" for the bundle)
 *   grant = book | course | both                (default: book)
 * or pass product_id = the GHL product ID saved on the title in admin.
 */
export async function POST(req: NextRequest) {
  if (!secretOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, any> | null;
  if (!body) return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });

  const custom: Record<string, any> = { ...(body.customData ?? {}), ...(body.custom_data ?? {}) };
  const email = String(body.email ?? body.contact?.email ?? custom.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Missing contact email" }, { status: 400 });
  const firstName = body.first_name ?? body.contact?.first_name ?? custom.first_name;
  const lastName = body.last_name ?? body.contact?.last_name ?? custom.last_name;
  let contactId: string | null = body.contact_id ?? body.contact?.id ?? custom.contact_id ?? null;

  const db = createAdminClient();

  // 1. Work out what to unlock.
  const { data: titles, error: tErr } = await db
    .from("titles")
    .select("id, slug, status, ghl_book_product_id, ghl_course_product_id");
  if (tErr || !titles) return NextResponse.json({ error: "Could not load titles" }, { status: 500 });

  const grants: { title_id: string; slug: string; kind: "book" | "course" }[] = [];
  const want = String(custom.title ?? body.title ?? "").trim().toLowerCase();
  const grant = String(custom.grant ?? body.grant ?? "book").trim().toLowerCase();
  const kinds: ("book" | "course")[] = grant === "both" ? ["book", "course"] : grant === "course" ? ["course"] : ["book"];
  const productId = String(custom.product_id ?? body.product_id ?? "").trim();

  if (want === "all") {
    titles.filter((t) => t.status === "live").forEach((t) => (["book", "course"] as const).forEach((k) => grants.push({ title_id: t.id, slug: t.slug, kind: k })));
  } else if (want) {
    const t = titles.find((x) => x.slug === want);
    if (!t) return NextResponse.json({ error: `No title with slug "${want}"` }, { status: 404 });
    kinds.forEach((k) => grants.push({ title_id: t.id, slug: t.slug, kind: k }));
  } else if (productId) {
    titles.forEach((t) => {
      if (t.ghl_book_product_id === productId) grants.push({ title_id: t.id, slug: t.slug, kind: "book" });
      if (t.ghl_course_product_id === productId) grants.push({ title_id: t.id, slug: t.slug, kind: "course" });
    });
    if (!grants.length) return NextResponse.json({ error: `No title uses GHL product ${productId}` }, { status: 404 });
  } else {
    return NextResponse.json({ error: "Say what to unlock: custom data 'title' (and 'grant') or 'product_id'" }, { status: 400 });
  }
  // The course always includes the book.
  grants.filter((g) => g.kind === "course").forEach((g) => {
    if (!grants.some((x) => x.title_id === g.title_id && x.kind === "book")) grants.push({ ...g, kind: "book" });
  });

  // 2. Find or create the student.
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
  let userId = await findUserId(db, email);
  let isNew = false;
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error && !(userId = await findUserId(db, email))) {
      return NextResponse.json({ error: `Could not create student: ${error.message}` }, { status: 500 });
    }
    userId = userId ?? data.user!.id;
    isNew = true;
  }

  // 3. Grant access.
  const { error: eErr } = await db
    .from("entitlements")
    .upsert(grants.map((g) => ({ user_id: userId, title_id: g.title_id, kind: g.kind, source: "ghl" })), {
      onConflict: "user_id,title_id,kind",
      ignoreDuplicates: true,
    });
  if (eErr) return NextResponse.json({ error: `Could not grant access: ${eErr.message}` }, { status: 500 });

  // 4. Link the GHL contact and send the login link.
  if (!contactId) contactId = await upsertContact(email, { firstName, lastName });
  await db.from("profiles").update({ ghl_contact_id: contactId, ...(fullName ? { full_name: fullName } : {}) }).eq("id", userId);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  let loginDelivery: "ghl" | "email" | "none" = "none";
  const fieldId = process.env.GHL_LOGIN_LINK_FIELD_ID;
  if (fieldId && contactId) {
    // Your GHL welcome email includes this link, so it arrives from your own address.
    const { data } = await db.auth.admin.generateLink({ type: "magiclink", email });
    const hashed = data?.properties?.hashed_token;
    if (hashed) {
      const link = `${site}/auth/confirm?token_hash=${hashed}&type=magiclink&next=/library`;
      if (await setCustomField(contactId, fieldId, link)) loginDelivery = "ghl";
    }
  }
  if (loginDelivery === "none") {
    const anon = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await anon.auth.signInWithOtp({ email, options: { emailRedirectTo: `${site}/library`, shouldCreateUser: false } });
    if (!error) loginDelivery = "email";
  }

  // 5. Tag the contact and record the purchase.
  const tags = [
    tag.accessGranted,
    ...new Set(grants.map((g) => (g.kind === "course" ? tag.course(g.slug) : tag.owner(g.slug)))),
  ];
  const tagged = contactId ? await addTags(contactId, tags) : false;
  await db.from("events").insert(
    tags.slice(1).map((t) => ({
      user_id: userId,
      title_id: grants.find((g) => t.startsWith(`aa-${g.slug}-`))?.title_id ?? null,
      name: "purchase",
      data: { source: "ghl", product_id: productId || null },
      ghl_tag: t,
      ghl_synced_at: tagged ? new Date().toISOString() : null,
    })),
  );

  return NextResponse.json({
    ok: true,
    student: { id: userId, email, new: isNew },
    granted: grants.map((g) => `${g.slug}:${g.kind}`),
    login_link: loginDelivery,
    ghl_tagged: tagged,
  });
}

function secretOk(req: NextRequest) {
  const expected = process.env.GHL_WEBHOOK_SECRET;
  if (!expected) return false;
  const given = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function findUserId(db: ReturnType<typeof createAdminClient>, email: string) {
  const { data } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
