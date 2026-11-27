export type Mode = "standard" | "fast";
export type Status = "queued" | "running" | "complete" | "failed";

export const stages = [
  ["Reference Analysis", "Checking the uploaded reference"],
  ["Panel Detection", "Identifying the front and back"],
  ["Artwork Generation", "Reconstructing both flat body panels"],
  ["Vector Optimization", "Tracing shapes and editable groups"],
  ["Quality Validation", "Rendering and checking the EPS files"],
  ["Export Preparation", "Preparing the downloads"]
] as const;

export interface Activity {
  step: number;
  phase: "running" | "complete" | "failed";
  message: string;
  at: number;
}

export interface PanelReport {
  bytes: number;
  paths: number;
  groups: number;
  rasters: number;
  subpaths: number;
  curves: number;
  lines: number;
  cmykColors: number;
  compounds: number;
  closes: number;
  clips: number;
  maxInk: number;
  compare: { ssim: number; meanDeltaE: number; p95DeltaE: number };
  proof: [number, number];
}

export interface Report {
  front: PanelReport;
  back: PanelReport;
  renderer: string;
  cmykProfile: string;
  packageBytes: number;
}

export interface Job {
  id: string;
  name: string;
  mode: Mode;
  status: Status;
  stage: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  frontReady: boolean;
  backReady: boolean;
  events: Activity[];
  report: Report | null;
  error: string | null;
  now: number;
}

export interface Workspace {
  available: boolean;
  setupPending?: boolean;
  signedIn: boolean;
  deviceWorkspace: boolean;
  email: string | null;
}
