"use client";

// Shared pieces for the Projects and Goals pages.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Area, Goal, Item, Project } from "@/lib/types";
import { AreaIcon } from "@/lib/icons";
import { today } from "@/lib/dates";

export const field = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
export const small = "rounded-lg border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent";
export const btn = "rounded-lg bg-button px-4 py-2 text-sm font-medium text-white disabled:opacity-30";
export const ghost = "rounded-lg border border-line px-4 py-2 text-sm hover:border-accent disabled:opacity-30";

const DAY = 86_400_000;
export function daysLeft(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / DAY);
}
export const fmtDate = (iso: string | null) => {
  if (!iso) return "no date";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** A text input that saves when you leave it or press Enter, and only if it changed. */
export function EditText({
  value,
  onSave,
  className,
  label,
  placeholder,
  multiline,
  wrap,
  autoSelect,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  /** One line that wraps and grows instead of scrolling sideways (for titles). Enter still saves. */
  wrap?: boolean;
  autoSelect?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onSave(v);
  if (multiline)
    return (
      <textarea
        value={v}
        rows={2}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        className={className}
      />
    );
  if (wrap)
    return (
      <textarea
        value={v}
        rows={1}
        placeholder={placeholder}
        aria-label={label}
        ref={(el) => {
          if (!el) return;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
          if (autoSelect && document.activeElement !== el && !el.dataset.selected) {
            el.dataset.selected = "1";
            el.focus();
            el.select();
          }
        }}
        onChange={(e) => {
          setV(e.target.value.replace(/\n/g, " "));
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={`resize-none overflow-hidden ${className ?? ""}`}
      />
    );
  return (
    <input
      value={v}
      placeholder={placeholder}
      aria-label={label}
      ref={(el) => {
        if (el && autoSelect && document.activeElement !== el && !el.dataset.selected) {
          el.dataset.selected = "1";
          el.focus();
          el.select();
        }
      }}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={className}
    />
  );
}

export function goalStats(g: Goal, items: Item[]) {
  const a = items.filter((i) => i.goal_id === g.id && !i.done_at);
  return { open: a.length, scheduled: a.filter((i) => i.block_id).length, musts: a.filter((i) => i.must).length };
}

const card = "flex min-h-28 flex-col gap-1 rounded-xl border border-l-4 border-line bg-surface p-4 text-left text-sm transition hover:border-accent";

export function GoalCard({ goal, area, items }: { goal: Goal; area?: Area; items: Item[] }) {
  const s = goalStats(goal, items);
  const left = daysLeft(goal.target_date);
  return (
    <Link href={`/goals/${goal.id}`} className={card} style={{ borderLeftColor: area ? `var(--area-${area.color})` : undefined }}>
      <span className="text-[11px] uppercase tracking-wide text-muted/50">Goal{goal.status !== "active" ? ` · ${goal.status}` : ""}</span>
      <b className="font-medium">{goal.goal}</b>
      {goal.target_date && (
        <span className="text-xs text-muted/60">
          by {fmtDate(goal.target_date)} · {left} days
        </span>
      )}
      <span className="text-xs text-muted/60">
        {s.open} open action{s.open === 1 ? "" : "s"} · {s.scheduled} scheduled
      </span>
      {goal.status === "active" && s.scheduled === 0 && (
        <span className="mt-1 self-start rounded-full bg-area-coral/15 px-2 py-0.5 text-[11px] text-area-coral">Nothing scheduled</span>
      )}
    </Link>
  );
}

export function ProjectCard({ project, area, goals, ruleCount }: { project: Project; area?: Area; goals: Goal[]; ruleCount?: number }) {
  const n = goals.filter((g) => g.project_id === project.id).length;
  return (
    <Link href={`/projects/${project.id}`} className={card} style={{ borderLeftColor: area ? `var(--area-${area.color})` : undefined }}>
      <span className="text-[11px] uppercase tracking-wide text-muted/50">Project{project.status !== "active" ? ` · ${project.status}` : ""}</span>
      <b className="font-medium">{project.title}</b>
      <span className="text-xs text-muted/60">
        {n} goal{n === 1 ? "" : "s"}
        {project.finish_date ? ` · finish ${fmtDate(project.finish_date)}` : ""}
      </span>
      {ruleCount === 0 && <span className="mt-1 self-start rounded-full bg-area-amber/15 px-2 py-0.5 text-[11px] text-area-amber">No schedule yet</span>}
    </Link>
  );
}

export function AreaHeading({ area }: { area: Area }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-medium">
      <AreaIcon icon={area.icon} color={area.color} className="size-4" />
      <Link href={`/areas/${area.id}`} className="hover:underline">
        {area.name}
      </Link>
    </h2>
  );
}

export function Section({ n, title, hint, children }: { n?: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        {n != null && <span className="grid size-6 place-items-center rounded-full bg-surface text-xs text-muted/70">{n}</span>}
        {title}
      </h2>
      {hint && <p className="text-xs text-muted/50">{hint}</p>}
      {children}
    </section>
  );
}
