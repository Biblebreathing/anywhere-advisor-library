import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { WelcomeView } from "./WelcomeView";

export const dynamic = "force-dynamic";

/** First visit shows the welcome page; returning students go straight to their library. */
export default async function Home() {
  const profile = await getProfile();
  if (profile?.welcomed_at) redirect("/library");
  return <WelcomeView />;
}
