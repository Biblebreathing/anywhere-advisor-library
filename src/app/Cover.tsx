import { coverUrl, type Title } from "@/lib/catalog";

/** Every cover renders in the same 2:3 frame; covers with a different shape sit on a blurred copy of themselves. */
export function Cover({ t }: { t: Pick<Title, "cover_path" | "title"> }) {
  const src = coverUrl(t);
  return (
    <span className="frame">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bgi" src={src} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fgi" src={src} alt={`${t.title} cover`} />
    </span>
  );
}
