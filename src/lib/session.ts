import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "student" | "editor" | "owner";
  welcomed_at: string | null;
};

/** The signed-in user's profile, or null. Cached for the request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, welcomed_at")
    .eq("id", auth.user.id)
    .maybeSingle();
  return (data as Profile | null) ?? { id: auth.user.id, email: auth.user.email ?? "", full_name: null, role: "student", welcomed_at: null };
});

export const isStaff = (p: Profile | null) => p?.role === "editor" || p?.role === "owner";

export async function requireStaff() {
  const p = await getProfile();
  if (!p) redirect("/login?next=/admin");
  if (!isStaff(p)) redirect("/library");
  return p;
}
