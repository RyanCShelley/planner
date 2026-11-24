"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import type { Area, AreaFocus, AreaSubRole, Block, Capture, FocusNote, Goal, Item, ItemStatus, Project, Review, ScheduleRule } from "./types";

export const db = () => createClient();

// After any write, every list on screen reloads, even if a realtime update is late or missing.
const CHANGED = "planner:changed";
export const changed = () => window.dispatchEvent(new Event(CHANGED));

// Errors are shown instead of failing silently.
export const ERROR = "planner:error";
export const showError = (message: string) => window.dispatchEvent(new CustomEvent(ERROR, { detail: message }));

/** Run a Supabase write; show its error if it fails, then refresh lists. Returns false on error. */
export async function mutate(q: PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
  const { error } = await q;
  if (error) showError(error.message);
  changed();
  return !error;
}

// Loads a table and reloads it whenever it changes on any device (Supabase realtime).
function useTable<T>(table: string, load: () => PromiseLike<{ data: T[] | null }>, deps: unknown[] = []) {
  const [rows, setRows] = useState<T[] | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    const res = (await load()) as { data: T[] | null; error?: { message: string } | null };
    if (res.error) showError(res.error.message);
    setRows(res.data ?? []);
  }, deps);

  useEffect(() => {
    reload();
    const ch = db()
      .channel(`${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => reload())
      .subscribe();
    window.addEventListener(CHANGED, reload);
    return () => {
      window.removeEventListener(CHANGED, reload);
      db().removeChannel(ch);
    };
  }, [reload, table]);

  return { rows, reload };
}

export function useAreas() {
  const { rows, reload } = useTable<Area>("areas", () => db().from("areas").select("*").order("sort"));
  return { areas: rows ?? [], loading: rows === null, reload };
}

export function useSubRoles(areaId?: string) {
  const { rows, reload } = useTable<AreaSubRole>(
    "area_sub_roles",
    () => {
      let q = db().from("area_sub_roles").select("*").order("sort").order("created_at");
      if (areaId) q = q.eq("area_id", areaId);
      return q;
    },
    [areaId],
  );
  return { subRoles: rows ?? [], loading: rows === null, reload };
}

export type ItemFilter = { inbox?: boolean; areaId?: string; goalId?: string; open?: boolean; status?: ItemStatus };

export function useBlocks(from: string, to: string) {
  const { rows, reload } = useTable<Block>(
    "blocks",
    () => db().from("blocks").select("*").gte("date", from).lte("date", to).order("start_time", { nullsFirst: false }).order("created_at"),
    [from, to],
  );
  return { blocks: rows ?? [], loading: rows === null, reload };
}

export function useItems(f: ItemFilter = {}) {
  const { rows, reload } = useTable<Item>(
    "items",
    () => {
      let q = db().from("items").select("*").order("created_at", { ascending: true });
      if (f.open !== false) q = q.is("done_at", null);
      if (f.inbox) q = q.is("area_id", null);
      if (f.areaId) q = q.eq("area_id", f.areaId);
      if (f.goalId) q = q.eq("goal_id", f.goalId);
      if (f.status) q = q.eq("status", f.status);
      return q;
    },
    [f.inbox, f.areaId, f.goalId, f.open, f.status],
  );
  return { items: rows ?? [], loading: rows === null, reload };
}

// Completing goes through the Python API so repeating items get their next instance.
export async function completeItem(id: string) {
  const { data } = await db().auth.getSession();
  const res = await fetch(`/api/items/${id}/complete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  changed();
  if (!res.ok) {
    showError(`Couldn't mark it done (${res.status}).`);
    throw new Error(await res.text());
  }
  return (await res.json()) as { next_due: string | null };
}

export function useProjects() {
  const { rows, reload } = useTable<Project>("projects", () => db().from("projects").select("*").order("created_at"));
  return { projects: rows ?? [], loading: rows === null, reload };
}

export function useGoals() {
  const { rows, reload } = useTable<Goal>("goals", () => db().from("goals").select("*").order("created_at"));
  return { goals: rows ?? [], loading: rows === null, reload };
}

/** Captures waiting to be chunked, for one project. */
export function useCaptures(projectId: string) {
  const { rows } = useTable<Capture>(
    "captures",
    () => db().from("captures").select("*").eq("project_id", projectId).order("created_at"),
    [projectId],
  );
  return { captures: rows ?? [] };
}

export function useRules(projectId: string) {
  const { rows } = useTable<ScheduleRule>(
    "schedule_rules",
    () => db().from("schedule_rules").select("*").eq("project_id", projectId).order("created_at"),
    [projectId],
  );
  return { rules: rows ?? [] };
}

/** Puts blocks for project schedules on the board for the next two weeks. Safe to call often. */
export async function fillScheduleBlocks(today: string) {
  const { data, error } = await db().rpc("fill_rule_blocks", { p_today: today, p_days: 14 });
  if (error) showError(error.message);
  else if (data) changed();
}

/** An area's focuses, newest first. The first one with no end date is the current focus. */
export function useFocuses(areaId: string) {
  const { rows } = useTable<AreaFocus>(
    "area_focuses",
    () => db().from("area_focuses").select("*").eq("area_id", areaId).order("started_on", { ascending: false }).order("created_at", { ascending: false }),
    [areaId],
  );
  return { focuses: rows ?? [], loading: rows === null };
}

export function useFocusNotes(focusIds: string[]) {
  const key = focusIds.join(",");
  const { rows } = useTable<FocusNote>(
    "focus_notes",
    () => db().from("focus_notes").select("*").in("focus_id", focusIds.length ? focusIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at"),
    [key],
  );
  return { notes: rows ?? [] };
}

/** The current focus of every area (one per area at most). */
export function useCurrentFocuses() {
  const { rows } = useTable<AreaFocus>("area_focuses", () => db().from("area_focuses").select("*").is("ended_on", null));
  return { focuses: rows ?? [] };
}

/** Actions finished on or after a date, newest first. */
export function useDoneSince(from: string) {
  const { rows } = useTable<Item>(
    "items",
    () => db().from("items").select("*").gte("done_at", from).order("done_at", { ascending: false }),
    [from],
  );
  return { done: rows ?? [] };
}

export function useReviews() {
  const { rows, reload } = useTable<Review>(
    "reviews",
    () => db().from("reviews").select("*").order("week_of", { ascending: false }),
  );
  return { reviews: rows ?? [], loading: rows === null, reload };
}

export type GoogleCalendarConnection = {
  user_id: string;
  email: string | null;
  planner_calendar_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  calendar_name: string | null;
};

export function useGoogleCalendarConnection() {
  const { rows, reload } = useTable<GoogleCalendarConnection>(
    "google_calendar_connections",
    () => db().from("google_calendar_connections").select("user_id, email, planner_calendar_id, created_at, updated_at"),
  );
  const connection = rows?.[0] ?? null;
  return {
    connection,
    connected: !!connection,
    loading: rows === null,
    reload,
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await db().auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export async function getGoogleAuthUrl(): Promise<string> {
  const res = await fetch("/api/auth/google/url", { headers: await authHeaders() });
  if (!res.ok) {
    showError(`Couldn't start Google sign-in (${res.status}).`);
    throw new Error(await res.text());
  }
  const json = (await res.json()) as { url: string };
  return json.url;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const res = await fetch("/api/auth/google/disconnect", {
    method: "POST",
    headers: await authHeaders(),
  });
  changed();
  if (!res.ok) {
    showError(`Couldn't disconnect Google Calendar (${res.status}).`);
    throw new Error(await res.text());
  }
}

export async function fetchGoogleCalendarEvents(start: string, end: string): Promise<GoogleCalendarEvent[]> {
  const res = await fetch(`/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    showError(`Couldn't load Google Calendar events (${res.status}).`);
    throw new Error(await res.text());
  }
  const json = (await res.json()) as { events: GoogleCalendarEvent[] };
  return json.events ?? [];
}

export async function syncBlockToGoogleCalendar(blockId: string): Promise<{ ok: boolean; google_event_id: string | null }> {
  const res = await fetch("/api/calendar/sync-block", {
    method: "POST",
    headers: {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ block_id: blockId }),
  });
  changed();
  if (!res.ok) {
    showError(`Couldn't sync block to Google Calendar (${res.status}).`);
    throw new Error(await res.text());
  }
  return (await res.json()) as { ok: boolean; google_event_id: string | null };
}

