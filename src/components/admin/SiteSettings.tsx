"use client";

import { useState } from "react";
import { updateSite } from "@/app/admin/actions";
import { UploadButton } from "./Uploader";
import type { FileInfo } from "./TitleEditor";

function SaveField({ label, value, placeholder, hint, onSave }: { label: string; value: string; placeholder: string; hint: string; onSave: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState("");
  return (
    <label className="fld">
      <span>{label}{msg && ` · ${msg}`}</span>
      <input className="inp" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
        onBlur={async () => { if (v !== value) { setMsg("saving…"); await onSave(v.trim()); setMsg("saved ✓"); } }} />
      <small className="muted">{hint}</small>
    </label>
  );
}

export function SiteSettings({ bookingUrl, welcomeUrl, welcome }: { bookingUrl: string; welcomeUrl: string; welcome: FileInfo }) {
  return (
    <div className="cards2" style={{ paddingBlock: 20 }}>
      <div className="panel stack">
        <h2>Welcome video</h2>
        <p className="muted">Plays on the welcome page every new student sees first. Keep it to 2–3 minutes.</p>
        {welcome ? (
          <p className="okf">✓ {welcome.name} <a className="lnk" href="/api/media/welcome/site" target="_blank" rel="noopener">Preview</a></p>
        ) : welcomeUrl ? <p className="okf">✓ Linked video</p> : <p className="miss">No welcome video yet</p>}
        <UploadButton target={{ kind: "welcome" }} label={welcome ? "Replace video" : "Upload video"} accept="video/*" primary={!welcome && !welcomeUrl} />
        <SaveField label="…or a video link" value={welcomeUrl} placeholder="https://vimeo.com/…" hint="For videos over 50 MB. Vimeo, Wistia, Bunny or unlisted YouTube." onSave={(v) => updateSite({ welcome_video_url: v })} />
      </div>
      <div className="panel stack">
        <h2>Booking</h2>
        <SaveField label="Strategy call booking link" value={bookingUrl} placeholder="https://api.leadconnectorhq.com/widget/booking/…" hint="Every “Book a call” button in the library opens this GHL calendar." onSave={(v) => updateSite({ booking_url: v })} />
      </div>
    </div>
  );
}
