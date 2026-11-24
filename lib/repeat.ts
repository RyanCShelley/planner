import type { Item, Repeat } from "./types";

export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const REPEATS: [Repeat, string][] = [
  ["never", "Never"],
  ["daily", "Daily"],
  ["weekdays", "Weekdays (Mon–Fri)"],
  ["weekly", "Weekly"],
  ["biweekly", "Every 2 weeks"],
  ["monthly", "Monthly"],
  ["days", "Specific days…"],
];

export function repeatLabel(i: Pick<Item, "repeat" | "repeat_days">): string {
  switch (i.repeat) {
    case "never":
      return "";
    case "days":
      return i.repeat_days?.length ? "every " + i.repeat_days.map((d) => WD[d]).join(", ") : "pick days";
    case "weekdays":
      return "weekdays";
    case "biweekly":
      return "every 2 weeks";
    default:
      return i.repeat;
  }
}
