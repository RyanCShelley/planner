"use client";

import { useRef, useState } from "react";
import type { Area, AreaFocus, FocusNote } from "@/lib/types";
import { changed, db, mutate, showError, useFocusNotes, useFocuses } from "@/lib/data";
import { today } from "@/lib/dates";
import { RichText } from "./rich-text";

const fmt = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const box = "rounded-xl border border-line bg-surface p-4";

/** Top of an area page: the current focus, notes on it, its history, and context about the area. */
export function AreaFocusPanel({ area }: { area: Area }) {
  const { focuses, loading } = useFocuses(area.id);
  const { notes } = useFocusNotes(focuses.map((f) => f.id));
  const [history, setHistory] = useState(false);
  const [context, setContext] = useState(!!area.context);
  const current = focuses.find((f) => !f.ended_on);
  const past = focuses.filter((f) => f.ended_on);

  // The first save creates the focus; later saves update it. A save that lands while the
  // first one is still being created waits for it, so one focus never becomes two.
  const creating = useRef<Promise<string | null> | null>(null);
  async function saveCurrent(body: string) {
    const id = current?.id ?? (creating.current ? await creating.current : null);
    if (id) return void (await mutate(db().from("area_focuses").update({ body }).eq("id", id)));
    if (!body) return;
    creating.current = (async () => {
      const { data, error } = await db().from("area_focuses").insert({ area_id: area.id, body, started_on: today() }).select("id").single();
      if (error) {
        showError(error.message);
        return null;
      }
      changed();
      return data.id as string;
    })();
    await creating.current;
  }
  // Ends the current focus (it moves to history) and starts an empty one.
  async function startNew() {
    creating.current = null;
    if (current) await mutate(db().from("area_focuses").update({ ended_on: today() }).eq("id", current.id));
    setHistory(false);
  }

  if (loading) return null;

  return (
    <div className="space-y-3">
      <section aria-label="Focus" className={box + " space-y-3"} style={{ borderTop: `3px solid var(--area-${area.color})` }}>
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Focus</h2>
          <span className="text-xs text-muted/50">{current ? `since ${fmt(current.started_on)}` : "what matters most here right now"}</span>
          <div className="ml-auto flex gap-3 text-xs">
            {current && (
              <button onClick={startNew} className="text-muted/60 hover:text-text">
                New focus
              </button>
            )}
            {past.length > 0 && (
              <button onClick={() => setHistory(!history)} aria-expanded={history} className="text-muted/60 hover:text-text">
                Past focuses ({past.length})
              </button>
            )}
          </div>
        </div>
        <RichText
          value={current?.body ?? ""}
          onSave={saveCurrent}
          label={`${area.name} focus`}
          placeholder="Type your focus for this area. Format it however helps."
        />
        {current && <Notes focus={current} notes={notes.filter((n) => n.focus_id === current.id)} />}
      </section>

      {history && (
        <section aria-label="Past focuses" className="space-y-3">
          {past.map((f) => (
            <div key={f.id} className={box + " space-y-3 opacity-90"}>
              <div className="text-xs text-muted/60">
                {fmt(f.started_on)} – {fmt(f.ended_on!)}
              </div>
              <RichText value={f.body} label={`Focus from ${fmt(f.started_on)}`} />
              <Notes focus={f} notes={notes.filter((n) => n.focus_id === f.id)} />
            </div>
          ))}
        </section>
      )}

      {context ? (
        <section aria-label="Context" className={box + " space-y-2"}>
          <h2 className="text-sm font-semibold">About this area</h2>
          <RichText
            value={area.context ?? ""}
            onSave={(html) => mutate(db().from("areas").update({ context: html || null }).eq("id", area.id))}
            label={`About ${area.name}`}
            placeholder="Who and what this area covers, what good looks like, anything you want to remember."
          />
        </section>
      ) : (
        <button onClick={() => setContext(true)} className="text-xs text-muted/50 hover:text-text">
          + Add context about this area
        </button>
      )}
    </div>
  );
}

function Notes({ focus, notes }: { focus: AreaFocus; notes: FocusNote[] }) {
  const [text, setText] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (await mutate(db().from("focus_notes").insert({ focus_id: focus.id, body: text.trim() }))) setText("");
  }
  return (
    <div className="space-y-2 border-t border-line pt-3">
      {notes.map((n) => (
        <p key={n.id} className="text-sm">
          <span className="mr-2 text-xs text-muted/50">{fmt(n.created_at)}</span>
          {n.body}
        </p>
      ))}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note: how is this going?"
          aria-label="Add a note"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button className="rounded-lg border border-line px-3 text-sm hover:border-accent">Note</button>
      </form>
    </div>
  );
}
