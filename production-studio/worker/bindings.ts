import type { Mode, Status } from "../src/contracts";
import type { IdentityEnv } from "./auth";

export interface JobParams { id: string }
export interface Env extends IdentityEnv {
  DB: D1Database;
  BUCKET: R2Bucket;
  PRODUCTION: Workflow<JobParams>;
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  STUDIO_ARTWORK_PROMPT?: string;
}

export interface JobRow {
  id: string;
  owner: string;
  name: string;
  source_type: string;
  source_hash: string;
  mode: Mode;
  status: Status;
  stage: number;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  updated_at: number;
  front_ready: number;
  back_ready: number;
  report: string | null;
  error: string | null;
}

export const prefix = (id: string) => "jobs/" + id + "/";
