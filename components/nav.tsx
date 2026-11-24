"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAreas } from "@/lib/data";
import { AreaIcon } from "@/lib/icons";

const ICON: Record<string, string> = {
  inbox: "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z",
  actions: "M4 5h4v14H4zM10 5h4v14h-4zM16 5h4v14h-4z",
  bench: "M4 6h16M4 12h16M4 18h10",
  projects: "M3 7h7l2 2h9v10H3z",
  review: "M5 4h14v16H5zM9 9l2 2 4-4M9 15h6",
};

// Order agreed with Ryan: Inbox first, then Actions.
export const NAV = [
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/actions", label: "Actions", icon: "actions" },
  { href: "/bench", label: "Work bench", short: "Bench", icon: "bench" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/review", label: "Weekly review", short: "Week", icon: "review" },
];

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
      <path d={ICON[name]} />
    </svg>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line p-4 md:flex">
      <div className="mb-6 px-3 text-sm font-semibold tracking-tight">Planner</div>
      {NAV.map((n) => {
        const active = path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-surface text-accent" : "text-muted/70 hover:text-text"
            }`}
          >
            <Icon name={n.icon} />
            {n.label}
          </Link>
        );
      })}
      <AreaLinks path={path} />
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </nav>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 flex border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV.map((n) => {
        const active = path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${active ? "text-accent" : "text-muted/60"}`}
          >
            <Icon name={n.icon} />
            {n.short ?? n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const light = root.dataset.theme !== "light";
    if (light) root.dataset.theme = "light";
    else delete root.dataset.theme;
    try {
      localStorage.setItem("planner-theme", light ? "light" : "dark");
    } catch {}
  }
  return (
    <button onClick={toggle} aria-label="Toggle light and dark" className="rounded-lg p-2 text-muted/60 transition hover:text-text">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" />
      </svg>
    </button>
  );
}

function AreaLinks({ path }: { path: string }) {
  const { areas } = useAreas();
  return (
    <div className="mt-8 flex flex-col gap-1">
      <Link href="/areas" className="mb-1 px-3 text-xs text-muted/50 hover:text-text">
        Areas
      </Link>
      {areas.map((a) => (
        <Link
          key={a.id}
          href={`/areas/${a.id}`}
          className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition ${
            path === `/areas/${a.id}` ? "bg-surface text-text" : "text-muted/70 hover:text-text"
          }`}
        >
          <AreaIcon icon={a.icon} color={a.color} className="size-4" />
          {a.name}
        </Link>
      ))}
    </div>
  );
}
