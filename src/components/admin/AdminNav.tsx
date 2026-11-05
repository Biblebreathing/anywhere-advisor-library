import Link from "next/link";

export function AdminNav({ current }: { current: "titles" | "students" | "settings" }) {
  const items = [["titles", "/admin", "Titles"], ["students", "/admin/students", "Students"], ["settings", "/admin/settings", "Site settings"]] as const;
  return (
    <nav className="anav" aria-label="Admin">
      <span className="eyebrow">Admin</span>
      {items.map(([k, href, label]) => (
        <Link key={k} href={href} aria-current={current === k ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
