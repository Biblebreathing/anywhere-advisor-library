import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sign in · The Anywhere Advisor Library" };

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/library");
  if (!email.includes("@")) redirect(`/login?error=email&next=${encodeURIComponent(next)}`);
  const h = await headers();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${site}${next.startsWith("/") ? next : "/library"}` },
  });
  redirect(error ? `/login?error=send&next=${encodeURIComponent(next)}` : `/login?sent=${encodeURIComponent(email)}`);
}

const ERRORS: Record<string, string> = {
  email: "Enter the email address you used when you bought the book.",
  send: "We couldn't send the link just now. Wait a minute and try again.",
  link: "That sign-in link has expired or was already used. Enter your email to get a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(sp.next ?? "/library");

  return (
    <main className="narrow">
      <div className="eyebrow">The Anywhere Advisor Library</div>
      <h1 className="display">Sign in</h1>
      {sp.sent ? (
        <div className="panel">
          <h2>Check your email</h2>
          <p className="muted">
            We sent a sign-in link to <b>{sp.sent}</b>. Open it on this device to go straight to your library. The link works
            once and expires in an hour.
          </p>
          <a className="btn ghost" href="/login">Use a different email</a>
        </div>
      ) : (
        <form action={sendLink} className="panel stack">
          <p className="muted">No password needed. Enter the email you used at checkout and we'll send you a sign-in link.</p>
          {sp.error && <p className="error" role="alert">{ERRORS[sp.error] ?? ERRORS.send}</p>}
          <label className="fld" htmlFor="email">
            <span>Email</span>
            <input className="inp" id="email" name="email" type="email" autoComplete="email" required placeholder="you@yourpractice.com" />
          </label>
          <input type="hidden" name="next" value={sp.next ?? "/library"} />
          <button className="btn gold" type="submit">Email me a sign-in link</button>
        </form>
      )}
    </main>
  );
}
