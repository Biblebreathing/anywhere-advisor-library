import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getProfile, isStaff } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Anywhere Advisor Library",
  description: "Books, audiobooks, workbooks and courses for financial advisors from Terrance McMahon.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0a1322" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  const initials = (profile?.full_name || profile?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"
        />
      </head>
      <body>
        <div className="wrap">
          <header className="top">
            <Link href={profile ? "/library" : "/"} className="brand">
              <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
                <circle cx="17" cy="17" r="15" fill="none" stroke="#e0b04a" strokeWidth="2" />
                <path d="M17 17 L17 7" stroke="#f6d27a" strokeWidth="2.4" strokeLinecap="round" />
                <path d="M17 17 L24 21" stroke="#e0b04a" strokeWidth="2" strokeLinecap="round" />
                <circle cx="17" cy="17" r="2" fill="#f6d27a" />
              </svg>
              <span>
                <b>The Anywhere Advisor Library</b>
                <small>Books, courses &amp; resources by Terrance McMahon</small>
              </span>
            </Link>
            <nav className="who">
              {profile ? (
                <>
                  <Link className="btn sm ghost" href="/welcome">Welcome video</Link>
                  <Link className="btn sm ghost" href="/library">My library</Link>
                  {isStaff(profile) && <Link className="btn sm ghost" href="/admin">Admin</Link>}
                  <form action="/auth/signout" method="post">
                    <button className="btn sm ghost" type="submit">Sign out</button>
                  </form>
                  <span className="avatar" title={profile.email}>{initials}</span>
                </>
              ) : (
                <Link className="btn sm" href="/login">Sign in</Link>
              )}
            </nav>
          </header>
          {children}
          <footer>The Anywhere Advisor™ · theanywhereadvisor.com</footer>
        </div>
      </body>
    </html>
  );
}
