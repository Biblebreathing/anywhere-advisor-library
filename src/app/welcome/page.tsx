import { WelcomeView } from "../WelcomeView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome · The Anywhere Advisor Library" };

/** Always shows the welcome page, so students can rewatch the video. */
export default function WelcomePage() {
  return <WelcomeView />;
}
