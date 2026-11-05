"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { registerUpload, type UploadTarget } from "@/app/admin/actions";

const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 50);

function mediaDuration(file: File): Promise<number | null> {
  const tag = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : null;
  if (!tag) return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(tag);
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 10000);
    el.src = url;
  });
}

const safe = (name: string) => name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80);

/** Uploads straight from the browser to Supabase Storage (resumable), then records the file. */
export function useUploader() {
  const router = useRouter();
  const [progress, setProgress] = useState<{ name: string; pct: number; index: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(targetOrFn: UploadTarget | ((i: number) => UploadTarget), files: File[]) {
    setError(null);
    const supabase = createClient();
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) return setError("Your session expired. Refresh the page and sign in again.");

    const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) {
      return setError(
        `“${tooBig.name}” is ${(tooBig.size / 1048576).toFixed(0)} MB. Uploads are limited to ${MAX_MB} MB. ` +
          (tooBig.type.startsWith("video") ? "Paste a Vimeo, Wistia or Bunny link for long videos instead." : "Export a smaller file (for audio, 64–96 kbps MP3 works well)."),
      );
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const target = typeof targetOrFn === "function" ? targetOrFn(i) : targetOrFn;
      const bucket = target.kind === "cover" ? "covers" : "media";
      const folder = target.kind === "welcome" ? "site" : `titles/${target.titleId}/${target.kind}`;
      const path = `${folder}/${crypto.randomUUID().slice(0, 8)}-${safe(file.name)}`;
      setProgress({ name: file.name, pct: 0, index: i + 1, total: files.length });
      const duration = await mediaDuration(file);
      try {
        await new Promise<void>((resolve, reject) => {
          const up = new tus.Upload(file, {
            endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
            retryDelays: [0, 2000, 5000, 10000],
            headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: { bucketName: bucket, objectName: path, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
            chunkSize: 6 * 1024 * 1024,
            onError: reject,
            onProgress: (sent, total) => setProgress({ name: file.name, pct: Math.round((sent / total) * 100), index: i + 1, total: files.length }),
            onSuccess: () => resolve(),
          });
          up.findPreviousUploads().then((prev) => { if (prev.length) up.resumeFromPreviousUpload(prev[0]); up.start(); });
        });
        await registerUpload(target, { bucket, path, name: file.name, size: file.size, mime: file.type || "application/octet-stream", duration });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`“${file.name}” didn't upload: ${/413|too large|exceeded/i.test(msg) ? `it's over the ${MAX_MB} MB limit` : msg.slice(0, 160)}`);
        setProgress(null);
        return;
      }
    }
    setProgress(null);
    router.refresh();
  }

  return { upload, progress, error, clearError: () => setError(null) };
}

/** A button that opens the file picker and uploads, showing a progress bar while it works. */
export function UploadButton({
  target, label, accept, multiple, primary, onDone,
}: { target: UploadTarget; label: string; accept: string; multiple?: boolean; primary?: boolean; onDone?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, progress, error } = useUploader();
  const [, start] = useTransition();
  return (
    <span className="up">
      <button type="button" className={`btn sm ${primary ? "gold" : ""}`} disabled={!!progress} onClick={() => input.current?.click()}>
        {progress ? `Uploading ${progress.total > 1 ? `${progress.index}/${progress.total} · ` : ""}${progress.pct}%` : label}
      </button>
      <input
        ref={input} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          e.target.value = "";
          if (files.length) start(async () => { await upload(target, files); onDone?.(); });
        }}
      />
      {progress && <span className="upbar"><i style={{ width: `${progress.pct}%` }} /></span>}
      {error && <span className="error small" role="alert">{error}</span>}
    </span>
  );
}

/** A drop zone for many files at once (bulk chapter audio). */
export function DropZone({ target, accept, children }: { target: UploadTarget | ((i: number) => UploadTarget); accept: string; children: React.ReactNode }) {
  const { upload, progress, error } = useUploader();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    const ok = accept.split(",").map((a) => a.trim());
    const files = Array.from(list ?? [])
      .filter((f) => ok.some((a) => (a.endsWith("/*") ? f.type.startsWith(a.slice(0, -1)) : f.name.toLowerCase().endsWith(a))))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (files.length) upload(target, files);
  };
  return (
    <div
      className={`drop ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
    >
      {children}
      <button type="button" className="btn sm" disabled={!!progress} onClick={() => input.current?.click()}>
        {progress ? `Uploading ${progress.index} of ${progress.total} · ${progress.pct}%` : "Choose files"}
      </button>
      <input ref={input} type="file" hidden multiple accept={accept} onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      {progress && <span className="upbar"><i style={{ width: `${progress.pct}%` }} /></span>}
      {error && <span className="error small" role="alert">{error}</span>}
    </div>
  );
}
