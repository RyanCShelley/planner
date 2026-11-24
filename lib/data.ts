"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import type { Area, Item } from "./types";

export const db = () => createClient();

// Loads a table and reloads it whenever it changes on any device (Supabase realtime).
function useTable<T>(table: string, load: () => PromiseLike<{ data: T[] | null }>, deps: unknown[] = []) {
  const [rows, setRows] = useState<T[] | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => setRows((await load()).data ?? []), deps);

  useEffect(() => {
    reload();
    const ch = db()
      .channel(`${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => reload())
      .subscribe();
    return () => {
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
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { next_due: string | null };
}
