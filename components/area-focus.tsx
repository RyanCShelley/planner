"use client";

import { useState } from "react";
import type { Area, AreaFocus, FocusNote } from "@/lib/types";
import { db, mutate, useFocusNotes, useFocuses } from "@/lib/data";
import { today } from "@/lib/dates";
import { RichText } from "./rich-text";

const fmt = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const box = "rounded-xl border border-line bg-surface p-4";
const link = "text-muted/60 hover:text-text";
const save = "rounded-lg bg-button px-3 py-1 text-xs font-medium text-white disabled:opacity-30";

type Mode = "view" | "edit" | "new";

/**
 * Top of an area page, kept like a notebook: the current focus is a finished page you can
 * Edit, or close by starting a New focus; closed pages stay in Past focuses with their notes.
 * Nothing saves until you press Save.
 */
export function AreaFocusPanel({ area }: { area: Area }) {
  const { focuses, loading } = useFocuses(area.id);
  const { notes } = useFocusNotes(focuses.map((f) => f.id));
  const current = focuses.find((f) => !f.ended_on);
  const past = focuses.filter((f) => f.ended_on);
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);

  if (loading) return null;
  // With no focus yet, the page is open for writing the first one.
  const writing = mode !== "view" || !current;
  const isNew = mode === "new" || !current;

  function open(m: Mode) {
    setDraft(m === "edit" ? (current?.body ?? "") : "");
    setMode(m);
  }

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    const s = db();
    let ok: boolean;
    if (isNew) {
      // The old page is closed today and a new one starts.
      ok = !current || (await mutate(s.from("area_focuses").update({ ended_on: today() }).eq("id", current.id)));
      if (ok) ok = await mutate(s.from("area_focuses").insert({ area_id: area.id, body: draft, started_on: today() }));
    } else {
      ok = await mutate(s.from("area_focuses").update({ body: draft }).eq("id", current!.id));
    }
    setBusy(false);
    if (ok) setMode("view");
  }

  return (
    <div className="space-y-3">
      <section aria-label="Focus" className={box + " space-y-3"} style={{ borderTop: `3px solid var(--area-${area.color})` }}>
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{isNew && current ? "New focus" : "Focus"}</h2>
          <span className="text-xs text-muted/50">
            {current && !(isNew && mode === "new") ? `since ${fmt(current.started_on)}` : "what matters most here right now"}
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            {writing ? (
              <>
                {current && (
                  <button onClick={() => setMode("view")} className={link}>
                    Cancel
                  </button>
                )}
                <button onClick={onSave} disabled={!draft || busy} className={save}>
                  Save
                </button>
              </>
            ) : (
              <>
                <button onClick={() => open("edit")} className={link}>
                  Edit
                </button>
                <button onClick={() => open("new")} className={link}>
                  New focus
                </button>
              </>
            )}
          </div>
        </div>

        {writing ? (
          <>
            <RichText
              key={mode + (current?.id ?? "")}
              value={mode === "edit" ? (current?.body ?? "") : ""}
              onChange={setDraft}
              label={`${area.name} focus`}
              placeholder="Type your focus for this area. Format it however helps."
            />
            {mode === "new" && current && (
              <p className="text-xs text-muted/50">Saving moves “since {fmt(current.started_on)}” to Past focuses.</p>
            )}
          </>
        ) : (
          <RichText value={current!.body} label={`${area.name} focus`} />
        )}
        {current && !writing && <Notes focus={current} notes={notes.filter((n) => n.focus_id === current.id)} />}
      </section>

      {past.length > 0 && (
        <button onClick={() => setHistory(!history)} aria-expanded={history} className="text-xs text-muted/60 hover:text-text">
          {history ? "Hide past focuses" : `Past focuses (${past.length})`}
        </button>
      )}
      {history && (
        <section aria-label="Past focuses" className="space-y-3">
          {past.map((f) => (
            <article key={f.id} aria-label={`Focus ${fmt(f.started_on)} to ${fmt(f.ended_on!)}`} className={box + " space-y-3"}>
              <div className="text-xs font-medium text-muted/60">
                {fmt(f.started_on)} – {fmt(f.ended_on!)}
              </div>
              <RichText value={f.body} label={`Focus from ${fmt(f.started_on)}`} />
              <Notes focus={f} notes={notes.filter((n) => n.focus_id === f.id)} />
            </article>
          ))}
        </section>
      )}

      <Context area={area} />
    </div>
  );
}

// "More about this area": a page that reads as finished, with Edit and Save.
function Context({ area }: { area: Area }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const label = `About ${area.name}`;

  async function onSave() {
    setBusy(true);
    const ok = await mutate(db().from("areas").update({ context: draft || null }).eq("id", area.id));
    setBusy(false);
    if (ok) setEditing(false);
  }
  function edit() {
    setDraft(area.context ?? "");
    setEditing(true);
  }

  if (!area.context && !editing)
    return (
      <button onClick={edit} className="text-xs text-muted/50 hover:text-text">
        + Add context about this area
      </button>
    );

  return (
    <section aria-label="Context" className={box + " space-y-2"}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">About this area</h2>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className={link}>
                Cancel
              </button>
              <button onClick={onSave} disabled={busy} className={save}>
                Save
              </button>
            </>
          ) : (
            <button onClick={edit} className={link}>
              Edit
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <RichText
          key="edit"
          value={area.context ?? ""}
          onChange={setDraft}
          label={label}
          placeholder="Who and what this area covers, what good looks like, anything you want to remember."
        />
      ) : (
        <RichText value={area.context ?? ""} label={label} />
      )}
    </section>
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
