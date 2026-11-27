import React, { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig, motion } from "motion/react";
import {
  Activity as Wave, Bell, Check, Circle, ClipboardCheck, Clock3, Download,
  Expand, File, FileArchive, Folder, Grid2X2, Image as ImageIcon,
  Layers3, LoaderCircle, LockKeyhole, Play, Printer, RefreshCw, Settings,
  ShieldCheck, Shirt, Sparkles, Spline, Upload, UserRound, X, Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { stages } from "./contracts";
import type { Job, Mode, Report, Workspace } from "./contracts";
import "./styles.css";

const siteBase = import.meta.env.BASE_URL.replace(/\/$/, "");
const sitePath = (path: string) => siteBase + path;
const routePath = () => window.location.pathname.slice(siteBase.length) || "/";

const formatBytes = (bytes: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(bytes / 1_000_000) + " MB";
const formatCount = new Intl.NumberFormat("en");
const elapsedTime = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const part = (n: number) => String(n).padStart(2, "0");
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? part(Math.floor(minutes / 60)) + ":" + part(minutes % 60) + ":" + part(seconds % 60) : part(minutes) + ":" + part(seconds % 60);
};
const duration = (milliseconds: number) => milliseconds < 60_000 ? (milliseconds / 1000).toFixed(1) + "s" : elapsedTime(milliseconds);
const artifact = (id: string, name: string) => "/api/studio/jobs/" + encodeURIComponent(id) + "/files/" + name;

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path.replace(/^\/api\//, "/api/studio/"), { ...options, credentials: "same-origin", cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The workspace could not complete the request.");
  return data;
}

function Logo() {
  return <span className="brand-viewport" aria-label="My Jersey">
    <svg className="logo-filter" aria-hidden="true" width="0" height="0">
      <defs><filter id="wordmark" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 9 0 0 -2.5" />
      </filter></defs>
    </svg>
    <img src={sitePath("/assets/my-jersey.webp")} alt="My Jersey" />
  </span>;
}

type Drawer = "projects" | "templates" | "activity" | "account";
const drawTitles: Record<Drawer, string> = { projects: "Projects", templates: "Templates", activity: "Activity", account: "Workspace" };
const navItems: { id: Drawer; icon: LucideIcon }[] = [
  { id: "projects", icon: Folder }, { id: "templates", icon: Grid2X2 }, { id: "activity", icon: Wave }
];

function Nav({ navigate, open }: { navigate: (path: string) => void; open: (drawer: Drawer) => void }) {
  return <header className="topbar glass">
    <a href="/" className="brand" title="Back to My Jersey Ecosystem"><Logo /></a>
    <span className="nav-divider" />
    <nav aria-label="Workspace" className="nav-links">
      <button type="button" className="new-production" onClick={() => navigate("/")}><Layers3 /> <span>New Production</span></button>
      {navItems.map(({id, icon: Icon}) => <button type="button" key={id} onClick={() => open(id)}><Icon /> <span>{drawTitles[id]}</span></button>)}
    </nav>
    <div className="nav-tools">
      <button type="button" className="icon-button" aria-label="Notifications" onClick={() => open("activity")}><Bell /></button>
      <button type="button" className="account-button" aria-label="Workspace settings" onClick={() => open("account")}><UserRound /></button>
    </div>
  </header>;
}

const heroText = {
  input: ["Jersey Production Studio", "Create production-ready, editable jersey artwork from your reference."],
  production: ["Production Studio", "AI-powered jersey production pipeline from reference to print-ready files."],
  export: ["Export Production Files", "Download your production-ready, editable artwork and technical report."]
} as const;
const inputPills: [LucideIcon, string][] = [[Spline, "AI Vector Production"], [Layers3, "Front & Back Artwork"], [Zap, "Print-Ready Output"]];
const productionPills: [LucideIcon, string][] = [[Sparkles, "AI Analysis"], [Layers3, "Vector Production"], [Shirt, "Front & Back Artwork"], [Printer, "Print-Ready Export"]];
type Page = keyof typeof heroText;

function Hero({ page }: { page: Page }) {
  const [title, subtitle] = heroText[page];
  return <header className={"hero hero-" + page}>
    <h1>{title}<span className="slashes" aria-hidden="true"><i/><i/></span></h1>
    <p>{subtitle}</p>
    {page !== "export" && <div className="feature-pills">
      {(page === "input" ? inputPills : productionPills).map(([Icon, text]) =>
        <span className="feature-pill" key={text}><Icon aria-hidden="true" />{text}</span>)}
    </div>}
  </header>;
}

function Stepper({ current }: { current: "production" | "export" }) {
  const active = current === "production" ? 1 : 2;
  return <ol className="stepper glass" aria-label="Production stages">
    {["Input", "Production", "Export"].map((name, index) => <li className={index === active ? "current" : index < active ? "done" : ""} key={name} aria-current={index === active ? "step" : undefined}>
      <span className="step-dot" aria-hidden="true">{index < active ? <Check/> : index === active && current === "production" ? <Settings/> : null}</span>
      <span>{name}</span>
    </li>)}
  </ol>;
}

function PanelTitle({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <header className="panel-heading">
    <h2 className="chisel"><Icon aria-hidden="true" />{title}</h2>
    {children}
  </header>;
}

function Corners() { return <span className="corners" aria-hidden="true"><i /><i /><i /><i /></span>; }

function Specs() {
  const items: [LucideIcon, string, string][] = [
    [Expand, "22 × 31 in", "per side"], [Layers3, "CMYK", "print color"],
    [Spline, "Editable", "vector EPS"], [FileArchive, "Master ZIP", "EPS, JPG, report"]
  ];
  return <div className="spec-grid">
    {items.map(([Icon,title,detail]) => <div key={title}><Icon aria-hidden="true" /><span>{title}</span><small>{detail}</small></div>)}
  </div>;
}

function InputPage({ workspace, onStart }: { workspace: Workspace | null; onStart: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [mode, setMode] = useState<Mode>("standard");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const requestKey = useRef(crypto.randomUUID());
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (next: File | undefined) => {
    if (!next || submittingRef.current) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type) || next.size > 10_000_000 || next.size === 0) {
      setError("Choose a JPG, PNG, or WebP image up to 10 MB.");
      return;
    }
    setError("");
    setPreview("");
    requestKey.current = crypto.randomUUID();
    setFile(next);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || submittingRef.current || !workspace?.available || !workspace.signedIn) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const body = new FormData();
      body.set("reference", file);
      body.set("mode", mode);
      const job = await call<Job>("/api/jobs", { method: "POST", body, headers: { "Idempotency-Key": requestKey.current } });
      onStart(job.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The production job could not start.");
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <>
    <Hero page="input" />
    <form className="input-grid" onSubmit={submit}>
      <section className="glass panel reference-panel">
        <PanelTitle title="Reference Jersey" icon={ImageIcon}><p className="heading-note">Upload a jersey design to generate editable artwork.</p></PanelTitle>
        <div className="reference-content">
          <input ref={upload} type="file" id="reference-file" className="visually-hidden" accept="image/jpeg,image/png,image/webp" onChange={event => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }} tabIndex={-1} aria-label="Reference image" />
          <button type="button" className={"reference-image media-frame" + (dragging ? " dragging" : "") + (preview ? " with-preview" : "")} onClick={() => upload.current?.click()}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}
            aria-label={file ? "Replace the jersey reference" : "Choose a jersey reference image"}>
            <Corners />
            {preview ? <img src={preview} alt="Uploaded jersey reference" onError={() => { setPreview(""); setFile(null); setError("This file could not be opened as an image."); }} /> :
              <span className="upload-empty"><span className="upload-symbol"><Upload /></span><strong>Drop your reference here</strong><span>or browse for an image</span><small>JPG, PNG or WebP · up to 10 MB</small></span>}
          </button>
          <div className="file-bar"><File /><span title={file?.name}>{file?.name ?? "Select a reference image"}</span>
            <button type="button" className="outline-button" onClick={() => upload.current?.click()} disabled={submitting}>
              {file ? <RefreshCw /> : <Upload />}{file ? "Replace Image" : "Browse Image"}
            </button>
          </div>
        </div>
      </section>
      <section className="glass panel settings-panel">
        <header className="settings-heading"><Settings aria-hidden="true"/><h2>Production Settings</h2></header>
        <div className="settings-content">
          <fieldset className="mode-field">
            <legend>Production Mode</legend>
            <span className="mode-note">Choose a generation mode.</span>
            <div className="mode-grid">
              {([
                { key: "standard", title: "Standard Mode", description: "High quality & balanced processing", Icon: Layers3 },
                { key: "fast", title: "Fast Mode", description: "Priority processing", Icon: Zap }
              ] as const).map(({key,title,description,Icon}) =>
                <label className={"mode-card" + (mode === key ? " selected" : "")} key={key}>
                  <input type="radio" name="production-mode" value={key} checked={mode === key} disabled={submitting}
                    onChange={() => { requestKey.current = crypto.randomUUID(); setMode(key); }} />
                  <Icon className="mode-icon" aria-hidden="true"/><span><strong>{title}</strong><small>{description}</small></span>
                  {mode === key && <span className="mode-check" aria-hidden="true"><Check/></span>}
                </label>)}
            </div>
          </fieldset>
          <div className="specification"><h3>Output Specification</h3><Specs /></div>
          <div className="generate-area">
            {error && <p className="status-note error" role="alert">{error}</p>}
            {(workspace?.setupPending || (workspace?.signedIn && !workspace.available)) && <p className="status-note" role="status">Production connection pending.</p>}
            {workspace && !workspace.setupPending && !workspace.signedIn && <p className="status-note" role="status">Sign in through your production workspace to start a job.</p>}
            <motion.button type="submit" className="primary-button" whileTap={{ scale: 0.985 }}
              disabled={!file || !workspace?.available || !workspace.signedIn || submitting}>
              {submitting ? <LoaderCircle className="spinner" /> : <Play aria-hidden="true" />}
              {submitting ? "Starting Production" : "Generate Production Files"}
            </motion.button>
          </div>
        </div>
      </section>
    </form>
  </>;
}

function PanelPreview({ side, job, exporting }: { side: "front" | "back"; job: Job; exporting: boolean }) {
  const title = side === "front" ? "Front" : "Back";
  const ready = side === "front" ? job.frontReady : job.backReady;
  return <section className="glass panel artwork-panel">
    <PanelTitle icon={Shirt} title={title + (exporting ? " Preview" : " Artwork")}>
      {exporting ? <span className="ready-chip"><Check />EPS Ready</span> : ready ? <LockKeyhole className="panel-lock" aria-label="Master locked"/> : null}
    </PanelTitle>
    <div className="artwork-content">
      <div className={"artwork-image media-frame" + (exporting ? " final-preview" : "")}>
        <Corners />
        {ready ? <img alt={title + (exporting ? " rendered EPS proof" : " locked flat artwork")} src={artifact(job.id, side + (exporting ? "-proof.jpg" : "-master.png"))} /> :
          <div className="artwork-empty"><Shirt aria-hidden="true"/><span>{title} artwork pending</span></div>}
      </div>
      {exporting && <a className="download-outline" href={artifact(job.id, side.toUpperCase() + "_BODY.eps")}><Download aria-hidden="true"/> Download {title} EPS</a>}
    </div>
  </section>;
}

const stageIcons = [ImageIcon, Layers3, Spline, Layers3, ShieldCheck, Download];

function Pipeline({ job }: { job: Job }) {
  return <section className="glass panel pipeline-panel">
    <header className="pipeline-heading"><Layers3/><h2>Production Pipeline</h2>
      <span className={"live-status " + job.status}>{job.status === "failed" ? "Needs Attention" : job.status === "queued" ? "Queued" : job.status === "complete" ? "Complete" : "Live Processing"}</span>
    </header>
    <ol className="pipeline-steps" aria-label="Production activity" aria-live="polite">
      {stages.map(([title, description], step) => {
        const done = job.events.find(entry => entry.step === step + 1 && entry.phase === "complete");
        const begun = job.events.find(entry => entry.step === step + 1 && entry.phase === "running");
        const issue = job.events.find(entry => entry.step === step + 1 && entry.phase === "failed");
        const active = !!begun && !done && !issue && job.status === "running";
        const Icon = stageIcons[step];
        return <li className={issue ? "failed" : done ? "finished" : active ? "active" : "pending"} key={title}>
          <span className="stage-mark" aria-hidden="true">{issue ? <X /> : done ? <Check /> : active ? <LoaderCircle className="spinner"/> : <Circle />}</span>
          <Icon className="task-icon" aria-hidden="true" />
          <span className="stage-label"><strong>{title}</strong><small>{issue?.message ?? done?.message ?? begun?.message ?? description}</small></span>
          {done && begun && <span className="stage-duration">{duration(done.at - begun.at)}</span>}
        </li>;
      })}
    </ol>
  </section>;
}

function JobProgress({ job }: { job: Job }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const initial = job.startedAt ? (job.finishedAt ?? job.now) - job.startedAt : 0;
    const observedAt = Date.now();
    setElapsed(initial);
    if (job.status !== "running") return;
    const interval = window.setInterval(() => setElapsed(initial + Date.now() - observedAt), 1000);
    return () => window.clearInterval(interval);
  }, [job.startedAt, job.finishedAt, job.now, job.status]);
  const percent = Math.round(new Set(job.events.filter(e => e.phase === "complete").map(e => e.step)).size * 100 / stages.length);
  return <div className="glass progress-panel">
    <strong><Layers3 aria-hidden="true"/>Production Progress</strong>
    <div className="progress-track" role="progressbar" aria-label="Completed production stages" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <motion.div initial={false} animate={{ width: percent + "%" }} transition={{ duration: 0.45, ease: "easeOut" }} />
    </div>
    <span className="progress-number">{percent}%</span>
    <span className="elapsed"><Clock3 aria-hidden="true"/>Elapsed {elapsedTime(elapsed)}</span>
  </div>;
}

function ProductionPage({job, navigate}: {job: Job; navigate: (path:string) => void}) {
  return <>
    <Hero page="production" />
    <Stepper current="production" />
    <div className="production-grid">
      <PanelPreview side="front" job={job} exporting={false} />
      <PanelPreview side="back" job={job} exporting={false} />
      <Pipeline job={job} />
    </div>
    {job.status === "failed" && <div className="glass job-error" role="alert"><p>{job.error ?? "Production stopped before validation finished."}</p><button type="button" className="outline-button" onClick={() => navigate("/")}>Return to Input</button></div>}
    <JobProgress job={job} />
  </>;
}

function TechnicalReport({ job, report }: { job: Job; report: Report }) {
  const metrics: [LucideIcon, string, number, number][] = [
    [Spline, "Vector Paths", report.front.paths, report.back.paths],
    [Layers3, "Vector Groups", report.front.groups, report.back.groups],
    [ImageIcon, "Embedded Rasters", report.front.rasters, report.back.rasters]
  ];
  return <section className="glass panel report-panel">
    <PanelTitle icon={Layers3} title="Technical Report"><span className="ready-chip"><Check />Production Complete</span></PanelTitle>
    <div className="report-content">
      <div className="report-checks"><span><Check/>True Vector</span><span><Check/>Editable</span><span><Check/>600 DPI Proof</span></div>
      <table className="metrics-table">
        <thead><tr><th scope="col">Metric</th><th scope="col">Front</th><th scope="col">Back</th></tr></thead>
        <tbody>{metrics.map(([Icon,label,front,back]) => <tr key={label}><th scope="row"><Icon />{label}</th><td>{formatCount.format(front)}</td><td>{formatCount.format(back)}</td></tr>)}</tbody>
      </table>
      <div className="report-spec"><Specs /></div>
      <div className="report-details">
        <div><Clock3 /><span>Total Time<strong>{elapsedTime((job.finishedAt ?? job.now) - (job.startedAt ?? job.createdAt))}</strong></span></div>
        <div><FileArchive/><span><b>ZIP Contents</b><small>2 EPS files · Technical report · 2 artwork JPGs</small></span></div>
      </div>
      <details className="proof-details"><summary>Fidelity and color</summary>
        <p>SSIM {report.front.compare.ssim.toFixed(4)} front · {report.back.compare.ssim.toFixed(4)} back</p>
        <p>Mean ΔE₀₀ {report.front.compare.meanDeltaE.toFixed(2)} front · {report.back.compare.meanDeltaE.toFixed(2)} back</p>
        <p>95th percentile ΔE₀₀ {report.front.compare.p95DeltaE.toFixed(2)} front · {report.back.compare.p95DeltaE.toFixed(2)} back</p>
        <p>{report.cmykProfile} · {report.renderer}</p>
      </details>
      <motion.a className="primary-button" whileTap={{ scale: 0.985 }} href={artifact(job.id, "master.zip")}><Download/>Download Master ZIP</motion.a>
    </div>
  </section>;
}

function ExportPage({ job }: { job: Job & { report: Report } }) {
  return <>
    <Hero page="export" />
    <Stepper current="export" />
    <div className="export-grid">
      <PanelPreview side="front" job={job} exporting />
      <PanelPreview side="back" job={job} exporting />
      <TechnicalReport job={job} report={job.report} />
    </div>
    <div className="export-meta"><span><Check /> Production Status <strong>Completed</strong></span>
      <span><Layers3 /> Output Size <strong>{formatBytes(job.report.front.bytes + job.report.back.bytes)}</strong></span>
    </div>
  </>;
}

function WorkspaceDrawer({ view, workspace, close, navigate }: { view: Drawer; workspace: Workspace | null; close: () => void; navigate: (path: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);
  useEffect(() => {
    if (view !== "projects" && view !== "activity") return;
    const signal = new AbortController();
    call<Job[]>("/api/jobs", { signal: signal.signal }).then(setJobs).catch(error => {
      if (!signal.signal.aborted) setError(error instanceof Error ? error.message : "Could not load projects.");
    });
    return () => signal.abort();
  }, [view]);
  const openJob = (job: Job) => {
    close();
    navigate((job.status === "complete" ? "/export/" : "/production/") + job.id);
  };
  return <dialog ref={dialog} className="drawer glass" aria-labelledby="drawer-title"
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
    <div className="drawer-inner">
      <header><h2 id="drawer-title">{drawTitles[view]}</h2><button className="icon-button" type="button" aria-label="Close" onClick={close}><X/></button></header>
      {view === "templates" && <div className="template-content"><Shirt/><h3>Front & Back Body</h3><p>22 × 31 in per side</p><p>Native CMYK · Editable EPS</p>
        <button type="button" className="outline-button" onClick={() => { close(); navigate("/"); }}>Use this template</button></div>}
      {view === "account" && <div className="account-content">
        <p>{workspace?.email ?? (workspace?.deviceWorkspace ? "Local workspace" : "Production workspace")}</p>
        <p>{workspace?.available ? "Production connection configured" : "Production connection pending"}</p>
        {workspace && !workspace.signedIn && !workspace.deviceWorkspace && <p>Open the workspace through your authorized Cloudflare Access hostname.</p>}
      </div>}
      {(view === "projects" || view === "activity") && <div className="drawer-list">
        {error ? <p role="alert">{error}</p> : jobs === null ? <p role="status">Loading…</p> : !jobs.length ?
          <p>{view === "projects" ? "Projects appear here after you start a production job." : "Activity appears here when a production job runs."}</p> :
          jobs.map(job => <button type="button" className="project-row" key={job.id} onClick={() => openJob(job)}>
            {view === "projects" ? <Folder /> : <Wave />}
            <span><strong>{job.name}</strong><small>{new Date(job.createdAt).toLocaleString()}</small></span>
            <span className={"job-badge " + job.status}>{job.status}</span>
          </button>)}
      </div>}
    </div>
  </dialog>;
}

function App() {
  const [route, setRoute] = useState(routePath);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobError, setJobError] = useState("");
  const match = route.match(/^\/(production|export)\/([a-f0-9-]{36})$/);
  const id = match?.[2];
  const page: Page = match?.[1] === "export" ? "export" : id ? "production" : "input";

  const navigate = (path: string, replace = false) => {
    const destination = sitePath(path);
    if (window.location.pathname === destination) { setRoute(path); return; }
    if (replace) window.history.replaceState({}, "", destination);
    else window.history.pushState({}, "", destination);
    setRoute(path);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  useEffect(() => {
    const handle = () => setRoute(routePath());
    window.addEventListener("popstate", handle);
    const signal = new AbortController();
    const getStatus = () => call<Workspace>("/api/workspace", { signal: signal.signal }).then(setWorkspace).catch(() => {});
    void getStatus();
    window.addEventListener("focus", getStatus);
    return () => {
      window.removeEventListener("popstate", handle);
      window.removeEventListener("focus", getStatus);
      signal.abort();
    };
  }, []);

  useEffect(() => {
    setJobError("");
    if (!id) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let failures = 0;
    const refresh = async () => {
      try {
        const current = await call<Job>("/api/jobs/" + id, { signal: controller.signal });
        failures = 0;
        setJobError("");
        setJob(current);
        if (current.status === "complete") navigate("/export/" + id, true);
        else if (page === "export") navigate("/production/" + id, true);
        if (current.status === "running" || current.status === "queued") timer = window.setTimeout(refresh, 2200);
      } catch (error) {
        if (controller.signal.aborted) return;
        setJobError(error instanceof Error ? error.message : "Could not read the production job.");
        if (++failures < 4) timer = window.setTimeout(refresh, 4500);
      }
    };
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [id, page]);

  useEffect(() => { document.title = "My Jersey | " + heroText[page][0]; }, [page]);
  const current = job?.id === id ? job : null;

  return <MotionConfig reducedMotion="user">
    <div className={"app page-" + page}>
      <Nav navigate={navigate} open={setDrawer} />
      <motion.main className="workspace" key={page + (id ?? "")}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: "easeOut" }}>
        {page === "input" ? <InputPage workspace={workspace} onStart={id => navigate("/production/" + id)} /> :
          current && page === "export" && current.status === "complete" && current.report ? <ExportPage job={{ ...current, report: current.report }} /> :
          current ? <ProductionPage job={current} navigate={navigate} /> :
            <><Hero page={page} /><div className="glass loading-state" role="status">
              {jobError || "Loading production…"}
              {jobError && <button type="button" className="outline-button" onClick={() => navigate("/")}>Return to Input</button>}
            </div></>}
        {current && jobError && <p className="refresh-error" role="status">{jobError}</p>}
      </motion.main>
      {drawer && <WorkspaceDrawer key={drawer} view={drawer} workspace={workspace} navigate={navigate} close={() => setDrawer(null)} />}
    </div>
  </MotionConfig>;
}

createRoot(document.getElementById("root")!).render(<App />);
