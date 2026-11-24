"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import type { Area, Block, Item } from "./types";

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

export type ItemFilter = { inbox?: boolean; areaId?: string; open?: boolean };

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
      return q;
    },
    [f.inbox, f.areaId, f.open],
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
