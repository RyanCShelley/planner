"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";

const DELAY = 800; // save this long after typing stops, and on leaving the editor

/**
 * Rich text you can type and format (bold, italic, headings, lists, quotes, links).
 * Stores HTML; the editor's schema drops anything it doesn't know, so stored HTML is never
 * rendered raw. Read-only when `onSave` is missing.
 */
export function RichText({ value, onSave, label, placeholder }: { value: string; onSave?: (html: string) => void; label: string; placeholder?: string }) {
  const saved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = !!onSave;

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: !editable, autolink: true } })],
    content: value,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "rich min-h-[4.5rem] text-sm", "aria-label": label, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(editor.getHTML()), DELAY);
    },
    onBlur: ({ editor }) => flush(editor.getHTML()),
  });

  function flush(html: string) {
    if (timer.current) clearTimeout(timer.current);
    const clean = html === "<p></p>" ? "" : html;
    if (!onSave || clean === saved.current) return;
    saved.current = clean;
    onSave(clean);
  }

  // Take in changes from another device, unless you're typing here.
  useEffect(() => {
    if (!editor || editor.isFocused || value === saved.current) return;
    saved.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  // Save anything pending when leaving the page.
  useEffect(() => () => editor && !editor.isDestroyed ? flush(editor.getHTML()) : undefined, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = useEditorState({ editor, selector: (s) => s.editor?.isEmpty ?? true });

  return (
    <div className="space-y-2">
      {editable && editor && <Toolbar editor={editor} />}
      <div className="relative">
        {empty && placeholder && <p className="pointer-events-none absolute text-sm text-muted/40">{placeholder}</p>}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

type Ed = NonNullable<ReturnType<typeof useEditor>>;

function Toolbar({ editor }: { editor: Ed }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
    }),
  });
  const B = ({ on, label, run, children }: { on: boolean; label: string; run: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep the selection in the editor
      onClick={run}
      className={`grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs ${on ? "bg-bg text-text" : "text-muted/60 hover:text-text"}`}
    >
      {children}
    </button>
  );
  const c = () => editor.chain().focus();
  function link() {
    if (s.link) return c().unsetLink().run();
    const url = window.prompt("Link to");
    if (url) c().setLink({ href: /^https?:\/\//.test(url) ? url : `https://${url}` }).run();
  }
  return (
    <div role="toolbar" aria-label={`Format`} className="flex flex-wrap gap-0.5 border-b border-line pb-1">
      <B on={s.bold} label="Bold" run={() => c().toggleBold().run()}>
        <b>B</b>
      </B>
      <B on={s.italic} label="Italic" run={() => c().toggleItalic().run()}>
        <i>I</i>
      </B>
      <B on={s.h2} label="Heading" run={() => c().toggleHeading({ level: 2 }).run()}>
        H
      </B>
      <B on={s.bullet} label="Bulleted list" run={() => c().toggleBulletList().run()}>
        • List
      </B>
      <B on={s.ordered} label="Numbered list" run={() => c().toggleOrderedList().run()}>
        1. List
      </B>
      <B on={s.quote} label="Quote" run={() => c().toggleBlockquote().run()}>
        “ ”
      </B>
      <B on={s.link} label="Link" run={link}>
        Link
      </B>
    </div>
  );
}
