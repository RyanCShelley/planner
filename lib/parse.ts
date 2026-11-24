import type { Repeat } from "./types";
import { addDays, today } from "./dates";

// Rule-based quick-add parser, ported from the prototype.
// Step 6 puts an AI cleanup pass in front of it; this stays as the offline fallback.

export type Draft = { title: string; repeat: Repeat; repeat_days: number[] | null; due_date: string | null };

const DN: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function parseOne(raw: string): Draft {
  let t = raw
    .trim()
    .replace(/^(and|then|also)\s+/i, "")
    .replace(/^(please\s+)?(remind me to|i need to|i have to|i should|i want to|need to|don't forget to|add)\s+/i, "");

  let repeat: Repeat = "never";
  let repeat_days: number[] | null = null;

  const dm = t.match(/\b(?:every|on)\s+((?:(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?(?:\s*(?:,|and|&)\s*)?)+)/i);
  if (dm && !/\bweekday/i.test(dm[0])) {
    const days = [...new Set((dm[1].toLowerCase().match(/sun|mon|tue|wed|thu|fri|sat/g) ?? []).map((x) => DN[x]))].sort();
    if (days.length > 1 || /^every/i.test(dm[0])) {
      repeat = days.length === 1 ? "weekly" : "days";
      repeat_days = days.length === 1 ? null : days;
      t = t.replace(dm[0], "");
    }
  }
  if (repeat === "never") {
    const rules: [RegExp, Repeat][] = [
      [/\b(every weekday|weekdays|every workday)\b/i, "weekdays"],
      [/\b(every other week|every 2 weeks|biweekly)\b/i, "biweekly"],
      [/\b(every ?day|daily|each day|every morning|every night)\b/i, "daily"],
      [/\b(every week|weekly)\b/i, "weekly"],
      [/\b(every month|monthly)\b/i, "monthly"],
    ];
    for (const [re, v] of rules)
      if (re.test(t)) {
        repeat = v;
        t = t.replace(re, "");
        break;
      }
  }

  let due_date: string | null = null;
  if (/\btomorrow\b/i.test(t)) {
    due_date = addDays(today(), 1);
    t = t.replace(/\btomorrow\b/i, "");
  } else if (/\b(today|tonight)\b/i.test(t)) {
    due_date = today();
    t = t.replace(/\b(today|tonight)\b/i, "");
  }

  t = t.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim().replace(/[.,!?]+$/, "").trim();
  return { title: t.charAt(0).toUpperCase() + t.slice(1), repeat, repeat_days, due_date };
}

export function parseMany(raw: string): Draft[] {
  return raw
    .split(
      /[.;\n]+|,(?!\s*(?:and\s+)?(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\b)\s*(?:and\s+)?|\s+and\s+(?:also\s+)?(?=(?:remind|call|email|text|buy|clean|book|schedule|pick|write|read|feed|take|pay|plan|send|get|fix|order|finish|start|go|do|look|check|water|lift|mow|walk|pray|run)\b)/i,
    )
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 2)
    .map(parseOne)
    .filter((d) => d.title);
}
