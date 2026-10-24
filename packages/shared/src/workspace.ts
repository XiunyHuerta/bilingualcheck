import { z } from "zod";

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "in_review", "completed"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export type ProfessionalSummary = { name: string | null; experience: string[]; specialty?: string | null };
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const TaskPatchBody = z.object({
  version: z.number().int().positive(),
  status: TaskStatusSchema.optional(),
  comment: z.string().trim().min(1).max(2000).optional(),
  assigned_submission_id: z.uuid().nullable().optional(),
  due_at: z.iso.datetime({ offset: true }).nullable().optional(),
}).refine(value => Object.keys(value).length > 1);

export type ProjectTask = {
  id: string; project_id: string; origin_key: string; title: string; description: string;
  status: TaskStatus; assigned_submission_id: string | null; due_at: string | null;
  dependencies: string[]; deliverables: string[];
  comments: { text: string; actor: "owner" | "professional"; created_at: string }[];
  version: number; created_at: string; updated_at: string;
};
export type ActivityEvent = {
  id: string; project_id: string; actor: "owner" | "agent" | "professional" | "system";
  action: string; previous_status: string | null; new_status: string | null;
  task_id: string | null; submission_id: string | null; detail: string | null;
  created_at: string;
};
export function taskProgress(tasks: readonly Pick<ProjectTask, "status">[]) {
  const completed = tasks.filter(task => task.status === "completed").length;
  return { total: tasks.length, completed, percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0 };
}

/** A public demo has its own data and reducer; it never calls authenticated services. */
export const DEMO_STEPS = ["goal", "understanding", "plan", "matching", "coordination", "deliverables", "result"] as const;
