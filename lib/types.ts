export type AreaColor = "amber" | "terra" | "coral" | "teal" | "ink";
export const AREA_COLORS: AreaColor[] = ["amber", "terra", "coral", "teal", "ink"];

export type Area = { id: string; name: string; icon: string; color: AreaColor; sort: number; context: string | null };

export type AreaSubRole = { id: string; area_id: string; name: string; sort: number };

export type Repeat = "never" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "days";

export type ItemStatus = "active" | "sometimes" | "pending";

export type Item = {
  id: string;
  title: string;
  notes: string | null;
  area_id: string | null;
  sub_role_id: string | null;
  project_id: string | null;
  goal_id: string | null;
  block_id: string | null;
  due_date: string | null; // YYYY-MM-DD
  repeat: Repeat;
  repeat_days: number[] | null; // 0 = Sunday
  leverage: string | null; // who or what can help
  priority: number | null;
  must: boolean;
  status: ItemStatus;
  waiting_on: string | null;
  batch_tag: string | null;
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
  goal_text: string | null;
  start_date: string | null;
  finish_date: string | null;
  status: ProjectStatus;
};

export type Review = {
  id: string;
  week_of: string; // YYYY-MM-DD
  mission_text: string | null;
  resolutions_text: string | null;
  step_completed: number;
  created_at: string;
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
export type AreaFocus = {
  id: string;
  area_id: string;
  body: string; // rich text (HTML)
  started_on: string;
  ended_on: string | null; // null = current
};

export type FocusNote = { id: string; focus_id: string; body: string; created_at: string };
