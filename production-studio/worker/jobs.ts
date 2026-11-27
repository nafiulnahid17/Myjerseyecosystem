import type { Activity, Job, Report } from "../src/contracts";
import type { Env, JobRow } from "./bindings";

export function jobRow(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>();
}

export function toJob(row: JobRow, events: Activity[] = []): Job {
  return {
    id: row.id, name: row.name, mode: row.mode, status: row.status, stage: row.stage,
    createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at,
    frontReady: !!row.front_ready, backReady: !!row.back_ready,
    events, report: row.report ? JSON.parse(row.report) as Report : null,
    error: row.error, now: Date.now(),
  };
}

export async function detail(env: Env, row: JobRow) {
  const { results } = await env.DB.prepare("SELECT step, phase, message, at FROM job_events WHERE job_id = ? ORDER BY at, step")
    .bind(row.id).all<Activity>();
  return toJob(row, results);
}

export async function record(env: Env, id: string, step: number, phase: Activity["phase"], message: string) {
  const now = Date.now();
  const state = phase === "failed" ? "failed" : "running";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO job_events (job_id, step, phase, message, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(id, step, phase, message, now),
    env.DB.prepare("UPDATE jobs SET status = ?, stage = MAX(stage, ?), started_at = COALESCE(started_at, ?), updated_at = ?, finished_at = CASE WHEN ? = 'failed' THEN ? ELSE finished_at END, error = CASE WHEN ? = 'failed' THEN ? ELSE error END WHERE id = ? AND status NOT IN ('complete','failed')")
      .bind(state, Math.min(step, 6), now, now, state, now, state, message, id),
  ]);
}

export async function commit(env: Env, id: string, result: Report) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO job_events (job_id, step, phase, message, at) VALUES (?, 6, 'complete', ?, ?) ON CONFLICT DO NOTHING")
      .bind(id, "Master ZIP and both EPS downloads are ready.", now),
    env.DB.prepare("UPDATE jobs SET status = 'complete', stage = 6, report = ?, updated_at = ?, finished_at = ? WHERE id = ? AND status = 'running'")
      .bind(JSON.stringify(result), now, now, id),
  ]);
}
