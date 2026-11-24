import type { Block, Part } from "./types";

export const PARTS: { id: Part; label: string; from: number; to: number }[] = [
  { id: "morning", label: "Morning", from: 6, to: 12 },
  { id: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { id: "evening", label: "Evening", from: 17, to: 22 },
];

export const partFor = (hour: number): Part => (hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening");

/** "HH:MM[:SS]" -> hours as a float (9.5 = 9:30). */
export const toHours = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
};

export const fmtTime = (hours: number) => {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours - Math.floor(hours)) * 60);
  const h12 = h % 12 || 12;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
};

export const fmtLen = (min: number) => (min % 60 === 0 ? `${min / 60}h` : min > 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);

export function blockTime(b: Pick<Block, "start_time" | "length_min">) {
  if (!b.start_time) return `~${fmtLen(b.length_min)} · flexible`;
  const s = toHours(b.start_time);
  return `${fmtTime(s)}–${fmtTime(s + b.length_min / 60)}`;
}

export const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240];
