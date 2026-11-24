export type AreaColor = "amber" | "terra" | "coral" | "teal" | "ink";
export const AREA_COLORS: AreaColor[] = ["amber", "terra", "coral", "teal", "ink"];

export type Area = { id: string; name: string; icon: string; color: AreaColor; sort: number };

export type Repeat = "never" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "days";

export type Item = {
  id: string;
  title: string;
  notes: string | null;
  area_id: string | null;
  project_id: string | null;
  goal_id: string | null;
  block_id: string | null;
  due_date: string | null; // YYYY-MM-DD
  repeat: Repeat;
  repeat_days: number[] | null; // 0 = Sunday
  must: boolean;
  done_at: string | null;
  created_at: string;
};

export type Part = "morning" | "afternoon" | "evening";

export type Block = {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  part_of_day: Part;
  length_min: number;
  start_time: string | null; // "HH:MM:SS" when pinned
  area_id: string | null;
  project_id: string | null;
  rule_id: string | null;
  gcal_event_id: string | null;
};
