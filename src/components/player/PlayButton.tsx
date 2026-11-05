"use client";

import type { BookAudio } from "@/lib/book";
import { PlayPauseIcon } from "./Player";
import { usePlayer } from "./PlayerProvider";

/** Plays a chapter (or resumes it if it's already loaded). Used on book, workbook and library pages. */
export function PlayButton({
  book, index, position = 0, label, className = "playbtn", expand = true,
}: { book: BookAudio; index: number; position?: number; label?: string; className?: string; expand?: boolean }) {
  const p = usePlayer();
  const ch = book.chapters[index];
  const isCurrent = p.book?.titleId === book.titleId && p.index === index;
  const ok = !!ch?.hasAudio && (book.owned || index === 0);
  return (
    <button
      type="button"
      className={className}
      disabled={!ok}
      title={!ch?.hasAudio ? "Audio coming soon" : !ok ? "Unlock the book to listen" : undefined}
      aria-label={label ?? `${isCurrent && p.playing ? "Pause" : "Play"} ${ch?.name ?? ""}`}
      onClick={() => {
        if (isCurrent) p.toggle();
        else { p.load(book, index, position, true); if (expand) p.setExpanded(true); }
      }}
    >
      <PlayPauseIcon playing={isCurrent && p.playing} />
      {label && <span>{isCurrent && p.playing ? "Pause" : label}</span>}
    </button>
  );
}
