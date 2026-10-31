# My Jersey Ecosystem — Engine-Aligned Frontend v3

**Atherious Labs · Frontend + private backend gateway · 31 October 2026**

This project replaces the former screenshot-overlay frontend. The UI is native HTML, CSS and JavaScript styled after the provided dark-neon design references. It does **not** include fabricated jobs, sample usage, credit balances, generated outputs, server-online badges, or artificial progress animation.

## v3 UI structure

- Responsive hamburger navigation with Home, Overview, Tool Overview, Add Credits, Users, Session Jobs, Support, Get Support and Report a Problem.
- Dedicated Home page and live-data-only main dashboard.
- Original Atherious Labs, My Jersey, Artboard AI, Frame Forge AI, AssetsX AI and Autofly SVG brand assets.
- Quality and Fast & Cost-Effective modes on all four tools; both map to the engines' existing `quality` and `cost_effective` values.
- Frame Forge keeps its three real mockup templates and three real video templates.
- Autofly remains a one-click Artboard orchestration workflow and does not duplicate Frame Forge templates.
- Credits, users and support submission screens fail closed until their real backends are connected; they do not show invented balances, members or ticket confirmations.

## Backend contract mapping

| Workspace | Source | Real user-facing operations |
| --- | --- | --- |
| Artboard AI | `nafiulnahid17/Artboard-AI---Resolution-Independent-` commit `0e82efe` (v0.3.1) | `POST /api/artboard/projects`, `/upload`, `/prepare`, `/production`, `/export`, then `GET /api/artboard/jobs/{id}` and project outputs. Supports one or two independently visible surfaces; real SVG/EPS/PDF/PNG/ZIP options. |
| Frame Forge AI | `nafiulnahid17/Frameforge_myjerseyengine` commit `3e9b262` | `POST /api/frameforge/jobs/mockup` using 1 of **3** real bundled mockup templates; optional `POST /api/frameforge/jobs/{id}/video` using 1 of **3** real bundled video templates. 10–30-second duration. File download only after `output_ready`. |
| AssetsX AI | `nafiulnahid17/assetxengine` commit `4e7b09d` (v0.1.0) | `POST /v1/assets` → `GET /v1/assets/{id}` analysis → optional selected-element and basic edit operations → `POST /v1/jobs` → validated outputs. Does not claim advanced generative editing or native font modification. |
| Autofly | `nafiulnahid17/autoflyengine_myjersey` commit `ddfd75e` | One-click Artboard orchestration from a text brief, one image clearly containing front+back, or separately uploaded front+back. Actual endpoints `/api/autofly/jobs/from-brief`, `/from-combined`, `/from-panels`. **No template picker, no separate mockup/video engine.** |

**Autofly compatibility limitation:** Its current backend uses older Artboard `/api/engine/…` endpoints. Artboard v0.3.1 uses `/api/artboard/…`. The frontend *does not fabricate a working bridge*. Before connecting Autofly to the newer Artboard, migrate its adapter and run end-to-end tests. Current Autofly one-click workflows reflect the current Autofly backend constraints, which require front and back for image-based orchestration.

## Visual behavior

- **Before any backend connection:** status says not checked/not configured, generated-output areas are empty, processing is disabled.
- **Real live health checks:** the gateway requests each engine's actual health endpoint using server-side credentials; only matching health payloads are shown as reachable.
- **After a real job submission:** only actual job ID, state, progress, trace and generated file names returned by the API are displayed. Session Jobs only contains jobs submitted during that browser session.
- **Frame Forge template images:** the six SVG previews are copied from the engine's actual source. They are static built-in template artwork, not fabricated generated results.
- **Original artwork previews:** read locally from a file the operator selects. Never labeled as AI-generated output.
- **No credits or billing UI:** those features require a real, separate backend contract.

## Run locally (gateway)

```bash
python -m pip install -r requirements.txt
# Copy .env.example to a safe, unserved secret manager or load as environment variables.
# Set MYJERSEY_ACCESS_TOKEN to a long random value.
MYJERSEY_ACCESS_TOKEN='your-private-token' uvicorn gateway:app --host 127.0.0.1 --port 8765
```

Open `http://127.0.0.1:8765`, select **Connect Gateway**, and enter your workspace access key. Until engine URLs and credentials are configured, checks will honestly return `not_configured`. `MYJERSEY_ARTBOARD_PRINCIPAL` is required for Artboard v0.3.1. The other tokens/URLs are configured server-side with `.env.example` names. HTTPS upstreams only, unless the explicitly enabled localhost-only development override is set.

The `Standalone_Interactive_Preview.html` is a self-contained, offline design preview including actual template SVGs. **When opened from disk it cannot reach live APIs**. Serve the project through the gateway to connect engines.

## Important security limitations

- A single operator-supplied workspace key in memory is sufficient for a **private operator prototype**, not production multi-tenant authentication. Before deploying to end users, integrate My Jersey's server-side user sessions, user-to-engine principal mapping, rate limits, audit trails, CSRF/session protections, and deployment access policies.
- Keep all API secrets out of the browser and GitHub repository; configure server environment variables. The server only serves explicit frontend files (not `.env`, `gateway.py`, tests or arbitrary workspace files).
- Outputs are proxied through allowlisted read routes and with no-store response headers; individual selected assets and editing operations use engine capabilities only.
- Never claim 'production ready' solely based on green CI or a healthy server. Real OpenRouter generation, design fidelity, licensed font editing, vector preflight and Adobe/Corel compatibility still require live validation.
- Large uploads and sessions with long-running jobs need a production-grade persistent queue and reverse proxy; the example gateway is not a deployment-scale job manager.

## Verify

```bash
python -m pytest -q tests
node --check app.js
```

Gateway, source-contract, navigation and brand/mode tests are included. Pixel-perfect matching is **not** claimed for this native UI.

## Files

- `index.html` — native UI shell
- `styles.css` — neon design system and responsive layout
- `app.js` — actual engine workflow UI, no mock responses
- `gateway.py` — private authenticated, allowlisted API gateway
- `templates/*.svg` — exact six SVG template previews bundled with Frame Forge
- `assets/*.svg` — original product and tool branding used by the navigation, Home and dashboard screens
- `.env.example` — environment variable names only, no secrets
- `tests/` — gateway security and contract checks
