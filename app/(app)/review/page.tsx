"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  completeItem,
  db,
  mutate,
  useAreas,
  useBlocks,
  useCurrentFocuses,
  useDoneSince,
  useGoals,
  useItems,
  useProjects,
  useReviews,
} from "@/lib/data";
import { addDays, dayLabel, today } from "@/lib/dates";
import { AreaIcon } from "@/lib/icons";
import type { Area, Goal, Item } from "@/lib/types";

const STEPS = [
  { num: 1, title: "Mission & Resolutions", short: "Mission" },
  { num: 2, title: "Gather & Triage Inbox", short: "Inbox" },
  { num: 3, title: "Process Notes & Follow-ups", short: "Follow-ups" },
  { num: 4, title: "Plan the Week", short: "Plan" },
] as const;

const BATCH_TAGS = ["SEO", "GEO", "dev", "family", "admin", "content", "outreach"];

const hrs = (min: number) => (min === 0 ? "0h" : `${Math.round((min / 60) * 10) / 10}h`);
const plain = (html: string) =>
  html
    .replace(/<\/(p|h\d|li|blockquote)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");

function getWeekOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return addDays(iso, -dt.getDay()); // Sunday of current week
}

export default function ReviewPage() {
  const t = today();
  const weekOf = getWeekOf(t);
  const end = addDays(t, 6);

  const { areas, loading: areasLoading } = useAreas();
  const { blocks } = useBlocks(t, end);
  const { items } = useItems(); // open items (done_at is null)
  const { goals } = useGoals();
  const { projects } = useProjects();
  const { focuses } = useCurrentFocuses();
  const { done } = useDoneSince(`${addDays(t, -7)}T00:00:00`);
  const { reviews, loading: reviewsLoading } = useReviews();

  const currentReview = useMemo(() => reviews.find((r) => r.week_of === weekOf) ?? null, [reviews, weekOf]);
  const latestPrevious = useMemo(() => reviews.find((r) => r.week_of !== weekOf) ?? null, [reviews, weekOf]);

  const [step, setStep] = useState<number>(1);
  const [missionText, setMissionText] = useState<string>("");
  const [resolutionsText, setResolutionsText] = useState<string>("");
  const [savingReview, setSavingReview] = useState(false);
  const [delegateInputs, setDelegateInputs] = useState<Record<string, string>>({});
  const [delegatingId, setDelegatingId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState({
    teamwork: false,
    emails: false,
    meetings: false,
  });

  // Sync local state when review loads
  useEffect(() => {
    if (currentReview) {
      setMissionText(currentReview.mission_text ?? "");
      setResolutionsText(currentReview.resolutions_text ?? "");
      if (currentReview.step_completed >= 1 && currentReview.step_completed < 4) {
        setStep(currentReview.step_completed + 1);
      }
    } else if (latestPrevious) {
      setMissionText(latestPrevious.mission_text ?? "");
      setResolutionsText(latestPrevious.resolutions_text ?? "");
    }
  }, [currentReview, latestPrevious]);

  const saveReviewProgress = async (nextStepCompleted?: number) => {
    setSavingReview(true);
    const stepVal = nextStepCompleted ?? currentReview?.step_completed ?? 0;
    if (currentReview) {
      await mutate(
        db()
          .from("reviews")
          .update({
            mission_text: missionText,
            resolutions_text: resolutionsText,
            step_completed: Math.max(currentReview.step_completed, stepVal),
          })
          .eq("id", currentReview.id),
      );
    } else {
      await mutate(
        db().from("reviews").insert({
          week_of: weekOf,
          mission_text: missionText,
          resolutions_text: resolutionsText,
          step_completed: stepVal,
        }),
      );
    }
    setSavingReview(false);
  };

  const handleAdvance = async (currentStepNum: number) => {
    await saveReviewProgress(currentStepNum);
    if (currentStepNum < 4) {
      setStep(currentStepNum + 1);
    }
  };

  const inboxItems = useMemo(
    () => items.filter((i) => !i.area_id && i.status === "active"),
    [items],
  );
  const pendingItems = useMemo(
    () => items.filter((i) => i.status === "pending"),
    [items],
  );
  const overdueItems = useMemo(
    () => items.filter((i) => i.status === "active" && i.due_date && i.due_date < t),
    [items, t],
  );
  const mustItems = useMemo(
    () => items.filter((i) => i.status === "active" && i.must),
    [items],
  );
  const activeItems = useMemo(
    () => items.filter((i) => i.status === "active"),
    [items],
  );

  const weekSummary = useMemo(() => {
    const weekBlocks = new Set(blocks.map((b) => b.id));
    const activeGoals = goals.filter((g) => g.status === "active");
    const scheduled = (g: Goal) =>
      items.filter((i) => i.goal_id === g.id && i.block_id && weekBlocks.has(i.block_id)).length;
    const areaOf = (b: (typeof blocks)[number]) => {
      if (b.area_id) return b.area_id;
      const n = new Map<string, number>();
      for (const i of items) if (i.block_id === b.id && i.area_id) n.set(i.area_id, (n.get(i.area_id) ?? 0) + 1);
      return [...n].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    };
    const blockArea = new Map(blocks.map((b) => [b.id, areaOf(b)]));
    const minutes = (a: Area) => blocks.filter((b) => blockArea.get(b.id) === a.id).reduce((s, b) => s + b.length_min, 0);
    const per = areas.map((a) => ({
      area: a,
      min: minutes(a),
      goals: activeGoals.filter((g) => g.area_id === a.id).map((g) => ({ g, n: scheduled(g) })),
      focus: focuses.find((f) => f.area_id === a.id),
      done: done.filter((i) => i.area_id === a.id).length,
    }));
    const unplanned = per.flatMap((p) => p.goals.filter((x) => x.n === 0).map((x) => x.g));
    const totalMin = blocks.reduce((s, b) => s + b.length_min, 0);
    return { per, unplanned, totalMin };
  }, [areas, blocks, items, goals, focuses, done]);

  if (areasLoading || reviewsLoading) {
    return (
      <div className="max-w-4xl animate-pulse space-y-8">
        <div className="h-8 w-48 rounded-lg bg-surface" />
        <div className="h-12 rounded-xl border border-line bg-surface" />
        <div className="h-64 rounded-xl border border-line bg-surface" />
      </div>
    );
  }

  const moveToSometimes = (id: string) =>
    mutate(db().from("items").update({ status: "sometimes" }).eq("id", id));

  const scheduleToday = (id: string) =>
    mutate(db().from("items").update({ due_date: t, status: "active" }).eq("id", id));

  const delegateItem = async (id: string) => {
    const waitingOn = (delegateInputs[id] ?? "").trim() || "Someone";
    await mutate(db().from("items").update({ status: "pending", waiting_on: waitingOn }).eq("id", id));
    setDelegatingId(null);
    setDelegateInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const reactivateItem = (id: string) =>
    mutate(db().from("items").update({ status: "active", waiting_on: null }).eq("id", id));

  const toggleMust = (item: Item) =>
    mutate(db().from("items").update({ must: !item.must }).eq("id", item.id));

  const setBatchTag = (id: string, tag: string) =>
    mutate(db().from("items").update({ batch_tag: tag || null }).eq("id", id));

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Weekly Review</h1>
          <p className="text-sm text-muted/60">
            Week of {dayLabel(weekOf)} · {currentReview?.step_completed === 4 ? "Completed" : `Step ${step} of 4`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted/60">
          <span>{blocks.length} blocks ({hrs(weekSummary.totalMin)})</span>
          <span>·</span>
          <span>{inboxItems.length} in Inbox</span>
          <span>·</span>
          <span>{pendingItems.length} Pending</span>
        </div>
      </div>

      {/* 4-Stage Linear Stepper */}
      <nav aria-label="Weekly Review Steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s) => {
          const isCurrent = step === s.num;
          const isDone = (currentReview?.step_completed ?? 0) >= s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                isCurrent
                  ? "border-accent bg-accent/10 text-text font-semibold"
                  : isDone
                    ? "border-accent/40 bg-surface text-text/90 hover:border-accent"
                    : "border-line bg-surface text-muted/60 hover:border-line/80 hover:text-text"
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isCurrent
                    ? "bg-accent text-bg"
                    : isDone
                      ? "bg-accent/20 text-accent"
                      : "bg-bg text-muted/60"
                }`}
              >
                {isDone && !isCurrent ? "✓" : s.num}
              </span>
              <span className="truncate">{s.short}</span>
            </button>
          );
        })}
      </nav>

      {/* Step 1: Mission & Resolutions */}
      {step === 1 && (
        <section aria-label="Step 1: Mission & Resolutions" className="space-y-5 rounded-xl border border-line bg-surface p-5">
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
            <span className="font-semibold text-accent">Weekly Reminder:</span> Take a moment to read through your
            personal mission and resolutions before diving into tasks.
          </div>

          <div className="space-y-2">
            <label htmlFor="mission-text" className="block text-xs font-semibold uppercase tracking-wide text-muted/70">
              Personal Mission
            </label>
            <textarea
              id="mission-text"
              rows={4}
              value={missionText}
              onChange={(e) => setMissionText(e.target.value)}
              placeholder="Write or review your core mission..."
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-muted/40 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="resolutions-text" className="block text-xs font-semibold uppercase tracking-wide text-muted/70">
              Resolutions & Commitments
            </label>
            <textarea
              id="resolutions-text"
              rows={4}
              value={resolutionsText}
              onChange={(e) => setResolutionsText(e.target.value)}
              placeholder="Key resolutions, principles, or commitments for this season..."
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-muted/40 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => saveReviewProgress()}
              disabled={savingReview}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50"
            >
              {savingReview ? "Saving..." : "Save Draft"}
            </button>
            <button
              type="button"
              onClick={() => handleAdvance(1)}
              disabled={savingReview}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-50"
            >
              Save & Continue →
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Gather & Triage Inbox */}
      {step === 2 && (
        <section aria-label="Step 2: Gather & Triage Inbox" className="space-y-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Gather & Triage Inbox</h2>
              <p className="text-xs text-muted/60">
                For each open item: do it in &lt;2 min, schedule soon, move to Sometimes, or delegate to Pending/Wait List.
              </p>
            </div>
            <Link href="/inbox" className="text-xs font-medium text-accent hover:underline">
              Open Inbox →
            </Link>
          </div>

          {inboxItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-bg/50 p-6 text-center text-sm text-muted/60">
              Inbox Zero! All loose captures are triaged.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {inboxItems.map((item) => (
                <li key={item.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.title}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => completeItem(item.id)}
                        className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                      >
                        &lt;2m Done
                      </button>
                      <button
                        type="button"
                        onClick={() => scheduleToday(item.id)}
                        className="rounded-md border border-line bg-bg px-2.5 py-1 text-xs hover:border-accent"
                      >
                        Schedule Today
                      </button>
                      <button
                        type="button"
                        onClick={() => moveToSometimes(item.id)}
                        className="rounded-md border border-line bg-bg px-2.5 py-1 text-xs text-muted/80 hover:border-accent"
                      >
                        Later (Sometimes)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDelegatingId(delegatingId === item.id ? null : item.id)}
                        className="rounded-md border border-line bg-bg px-2.5 py-1 text-xs text-muted/80 hover:border-accent"
                      >
                        Delegate
                      </button>
                    </div>
                  </div>
                  {delegatingId === item.id && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        autoFocus
                        value={delegateInputs[item.id] ?? ""}
                        onChange={(e) => setDelegateInputs((p) => ({ ...p, [item.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && delegateItem(item.id)}
                        placeholder="Waiting on (person or team)..."
                        className="flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-muted/40 focus:border-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => delegateItem(item.id)}
                        className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-bg"
                      >
                        Move to Pending
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-accent"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => handleAdvance(2)}
              disabled={savingReview}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-50"
            >
              Save & Continue →
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Process Notes & Follow-ups */}
      {step === 3 && (
        <section aria-label="Step 3: Process Notes & Follow-ups" className="space-y-5 rounded-xl border border-line bg-surface p-5">
          <div>
            <h2 className="text-base font-semibold">Process Notes & Follow-ups</h2>
            <p className="text-xs text-muted/60">
              Review last week&apos;s completed &amp; undone items, Teamwork/notes, missed emails, and upcoming meetings.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-bg/50 p-3.5 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                Done Last 7 Days ({done.length})
              </h3>
              {done.length === 0 ? (
                <p className="text-xs text-muted/50">No completed items recorded in the last 7 days.</p>
              ) : (
                <ul className="max-h-44 space-y-1 overflow-y-auto text-xs">
                  {done.slice(0, 15).map((i) => (
                    <li key={i.id} className="truncate text-muted/80">
                      ✓ {i.title}
                    </li>
                  ))}
                  {done.length > 15 && <li className="pt-1 text-muted/50">+ {done.length - 15} more</li>}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-line bg-bg/50 p-3.5 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-area-coral">
                Overdue / Undone ({overdueItems.length})
              </h3>
              {overdueItems.length === 0 ? (
                <p className="text-xs text-muted/50">No overdue items.</p>
              ) : (
                <ul className="max-h-44 space-y-1.5 overflow-y-auto text-xs">
                  {overdueItems.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{i.title}</span>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => scheduleToday(i.id)}
                          className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:border-accent"
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => completeItem(i.id)}
                          className="rounded border border-accent/40 px-1.5 py-0.5 text-[11px] text-accent"
                        >
                          Done
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Review Checklist */}
          <div className="space-y-2 rounded-lg border border-line bg-bg/50 p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/70">Follow-up Checklist</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checklist.teamwork}
                onChange={(e) => setChecklist((c) => ({ ...c, teamwork: e.target.checked }))}
                className="accent-accent"
              />
              Reviewed Teamwork &amp; project notes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checklist.emails}
                onChange={(e) => setChecklist((c) => ({ ...c, emails: e.target.checked }))}
                className="accent-accent"
              />
              Checked follow-ups &amp; missed emails
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checklist.meetings}
                onChange={(e) => setChecklist((c) => ({ ...c, meetings: e.target.checked }))}
                className="accent-accent"
              />
              Reviewed upcoming meetings for the week
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-accent"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => handleAdvance(3)}
              disabled={savingReview}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-50"
            >
              Save & Continue →
            </button>
          </div>
        </section>
      )}

      {/* Step 4: Plan the Week */}
      {step === 4 && (
        <section aria-label="Step 4: Plan the Week" className="space-y-5 rounded-xl border border-line bg-surface p-5">
          <div>
            <h2 className="text-base font-semibold">Plan the Week</h2>
            <p className="text-xs text-muted/60">
              Decide this week&apos;s Musts, batch similar tasks, and ensure active project goals have time scheduled.
            </p>
          </div>

          {/* Week's Musts & Batching */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/70">
              Week&apos;s Musts ({mustItems.length}) &amp; Batching
            </h3>
            {activeItems.length === 0 ? (
              <p className="text-xs text-muted/50">No active items.</p>
            ) : (
              <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-bg/50 px-3">
                {activeItems.slice(0, 20).map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleMust(item)}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          item.must ? "bg-accent text-bg" : "border border-line text-muted/60 hover:border-accent"
                        }`}
                      >
                        Must
                      </button>
                      <span className="truncate">{item.title}</span>
                    </div>
                    <select
                      aria-label={`Batch tag for ${item.title}`}
                      value={item.batch_tag ?? ""}
                      onChange={(e) => setBatchTag(item.id, e.target.value)}
                      className="rounded border border-line bg-bg px-2 py-1 text-xs text-text focus:border-accent focus:outline-none"
                    >
                      <option value="">No batch</option>
                      {BATCH_TAGS.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Per-area Goals & Focus */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/70">
              Areas &amp; Active Goals ({weekSummary.unplanned.length} unplanned)
            </h3>
            {weekSummary.per.map(({ area, min, goals: gs, focus, done: d }) => (
              <div
                key={area.id}
                className="space-y-2 rounded-lg border border-line bg-bg/50 p-3"
                style={{ borderTop: `3px solid var(--area-${area.color})` }}
              >
                <div className="flex items-center gap-2">
                  <AreaIcon icon={area.icon} color={area.color} className="size-4" />
                  <Link href={`/areas/${area.id}`} className="text-sm font-semibold hover:underline">
                    {area.name}
                  </Link>
                  <span className="ml-auto text-xs text-muted/60">
                    {hrs(min)} blocked · {d} done
                  </span>
                </div>
                {focus && plain(focus.body) && (
                  <p className="line-clamp-1 text-xs text-muted/70">Focus: {plain(focus.body)}</p>
                )}
                {gs.length > 0 && (
                  <ul className="divide-y divide-line">
                    {gs.map(({ g, n }) => {
                      const project = projects.find((p) => p.id === g.project_id);
                      return (
                        <li key={g.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                          <span className="truncate">
                            {g.goal} {project && <span className="text-muted/50">· {project.title}</span>}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {n > 0 ? (
                              <span className="text-accent">{n} scheduled</span>
                            ) : (
                              <span className="rounded-full bg-area-coral/15 px-2 py-0.5 text-[11px] text-area-coral">
                                Nothing scheduled
                              </span>
                            )}
                            <Link href="/actions" className="font-medium text-accent hover:underline">
                              Schedule →
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-accent"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => handleAdvance(4)}
              disabled={savingReview}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-50"
            >
              {currentReview?.step_completed === 4 ? "Review Completed ✓" : "Complete Weekly Review ✓"}
            </button>
          </div>
        </section>
      )}

      {/* Dedicated Pending / Wait List */}
      <section aria-label="Pending / Wait List" className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Pending / Wait List</h2>
            <p className="text-xs text-muted/60">
              Delegated items waiting on someone else ({pendingItems.length}).
            </p>
          </div>
        </div>

        {pendingItems.length === 0 ? (
          <p className="text-xs text-muted/50">No pending or delegated items right now.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pendingItems.map((item) => {
              const area = areas.find((a) => a.id === item.area_id);
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      {area && (
                        <span className="rounded bg-bg px-1.5 py-0.5 text-[11px] text-muted/70">
                          {area.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted/60">
                      Waiting on: <span className="text-text/90">{item.waiting_on || "Unspecified"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => reactivateItem(item.id)}
                      className="rounded-md border border-line bg-bg px-2.5 py-1 text-xs hover:border-accent"
                    >
                      Move to Active
                    </button>
                    <button
                      type="button"
                      onClick={() => completeItem(item.id)}
                      className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                    >
                      Resolve / Complete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
