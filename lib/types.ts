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
  leverage: string | null; // who or what can help
  priority: number | null;
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

export type ProjectStatus = "active" | "paused" | "done";

export type Project = {
  id: string;
  area_id: string;
  title: string;
  purpose: string | null;
  start_date: string | null;
  finish_date: string | null;
  status: ProjectStatus;
};

export type Goal = {
  id: string;
  area_id: string;
  project_id: string | null;
  goal: string; // what do I want?
  purpose: string | null; // why do I want it?
  target_date: string | null;
  status: "active" | "done" | "dropped";
};

export type Capture = {
  id: string;
  project_id: string | null;
  kind: "idea" | "communication";
  text: string;
};

export type ScheduleRule = {
  id: string;
  project_id: string;
  name: string;
  days: number[]; // 0 = Sunday
  part_of_day: Part;
  length_min: number;
  pinned_time: string | null;
};
