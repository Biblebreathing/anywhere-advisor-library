"use client";

import { useState, useTransition } from "react";
import { setAccess } from "@/app/admin/actions";

export function AccessToggle({ userId, titleId, kind, on }: { userId: string; titleId: string; kind: "book" | "course"; on: boolean }) {
  const [checked, setChecked] = useState(on);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      aria-label={`${kind} access`}
      onChange={(e) => {
        const v = e.target.checked;
        setChecked(v);
        start(async () => { try { await setAccess(userId, titleId, kind, v); } catch { setChecked(!v); } });
      }}
    />
  );
}
