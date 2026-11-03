# My Jersey Ecosystem — Reference-Aligned Frontend v5

**Atherious Labs · Frontend + private backend gateway · 31 October 2026**

This project replaces the former screenshot-overlay frontend. The UI is native HTML, CSS and JavaScript, rebuilt against the supplied My Jersey/Atherious Labs reference screens with the same deep-navy, electric-cyan, violet and gold visual language. It does **not** include fabricated jobs, sample usage, credit balances, generated outputs, server-online badges, recent files, or artificial progress animation.

## v5 UI structure

- Reference-aligned responsive navigation with Home first, Overview immediately below Home, and all four workspaces, Emergency Tools, Work History, Add Credits, Users, Support, Get Support, Report a Problem and Settings. It becomes a hamburger drawer on compact screens.
- The default Home landing page now features four highlighted tool-card illustrations, small explanatory workflow strips and real engine-aligned labels; Overview appears immediately below Home in navigation. The redundant Tool Overview route is removed.
- Atherious Labs, My Jersey, Artboard AI, Frame Forge AI, AssetsX AI and Autofly SVG brand assets used throughout the header, sidebar, workspace ribbons and footer.
- Quality and Fast & Cost-Effective modes on all four tools; both map to the engines' existing `quality` and `cost_effective` values.
- Frame Forge retains its three real mockup and three real video template IDs, now illustrated with optimized WebP crops from the user's approved design references. These are static reference artwork, not generated output.
- Autofly remains a one-click Artboard orchestration workflow and does not duplicate Frame Forge templates.
- Artboard follows the real five-stage Input → Artwork Creation → Vectorization → Validation → Export workflow. Reference analysis is shown inside Artwork Creation before the gradual render; it is not a separate navigation step.
- Production Activity uses friendly stage names and verified progress milestones. Decorative scan/trace motion fills intervals where the backend cannot stream partial pixels, while generated artwork, saved SVG paths and validation values always come from real engine artifacts.
- **Continue with Illustrator** hands a validated SVG to the operating-system app chooser where browser support exists; otherwise it downloads the SVG and opens Adobe's official Illustrator page. It does not fabricate native-app detection.
- Credits, users, history, emergency and support submission screens fail closed until their real backends are connected; they do not show invented balances, members, jobs, providers or ticket confirmations.

## Backend contract mapping

| Workspace | Source | Real user-facing operations |
| --- | --- | --- |
| Artboard AI | `nafiulnahid17/Artboard-AI---Resolution-Independent-` commit `d73a8a6` | `POST /api/artboard/projects`, `/upload`, `/prepare`, `/production`, `/export`, then `GET /api/artboard/jobs/{id}` and project outputs. Supports one or two independently visible surfaces; real SVG/EPS/PDF/PNG/ZIP options. Its AI contract produces full-bleed 22 × 31 inch flat production artwork with source-derived branding, large connected main shapes and vector-friendly path discipline. |
| Frame Forge AI | `nafiulnahid17/Frameforge_myjerseyengine` commit `3e9b262` | `POST /api/frameforge/jobs/mockup` using 1 of **3** real bundled mockup templates; optional `POST /api/frameforge/jobs/{id}/video` using 1 of **3** real bundled video templates. 10–30-second duration. File download only after `output_ready`. |
| AssetsX AI | `nafiulnahid17/assetxengine` commit `4e7b09d` (v0.1.0) | `POST /v1/assets` → `GET /v1/assets/{id}` analysis → optional selected-element and basic edit operations → `POST /v1/jobs` → validated outputs. Does not claim advanced generative editing or native font modification. |
| Autofly | `nafiulnahid17/autoflyengine_myjersey` commit `ddfd75e` | One-click Artboard orchestration from a text brief, one image clearly containing front+back, or separately uploaded front+back. Actual endpoints `/api/autofly/jobs/from-brief`, `/from-combined`, `/from-panels`. **No template picker, no separate mockup/video engine.** |

**Autofly compatibility limitation:** Its current backend uses older Artboard `/api/engine/…` endpoints. Artboard v0.3.1 uses `/api/artboard/…`. The frontend *does not fabricate a working bridge*. Before connecting Autofly to the newer Artboard, migrate its adapter and run end-to-end tests. Current Autofly one-click workflows reflect the current Autofly backend constraints, which require front and back for image-based orchestration.

## Visual behavior

- **Before any backend connection:** status says not checked/not configured, generated-output areas are empty, processing is disabled.
- **Real live health checks:** the gateway requests each engine's actual health endpoint using server-side credentials; only matching health payloads are shown as reachable.
- **After a real job submission:** only actual job ID, state, progress, trace and generated file names returned by the API are displayed. Session Jobs only contains jobs submitted during that browser session.
- **Artboard AI artwork:** The engine's configured mode and model routing remain authoritative. Analysis stays inside Artwork Creation, while the returned vectorization and validation results are presented on dedicated live UI surfaces without issuing duplicate image-generation requests.
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

Gateway, source-contract, navigation, brand/mode and honest-empty-state tests are included. The layouts are tuned to the supplied 1536px desktop references and remain usable at tablet and mobile widths.

## Files

- `index.html` — native UI shell
- `styles.css` — neon design system and responsive layout
- `app.js` — actual engine workflow UI, no mock responses
- `gateway.py` — private authenticated, allowlisted API gateway
- `templates/*.svg` — exact six SVG template previews bundled with Frame Forge
- `assets/*.svg` — original product and tool branding used by navigation, Home and dashboard screens
- `assets/media/*.webp` — ten optimized illustration crops (four tool cards, three mockup and three video templates), all from the user-provided design screenshots.
- `.env.example` — environment variable names only, no secrets
- `tests/` — gateway security and contract checks


## Cloudflare deployment — same Worker, private Artboard bridge (1 Nov 2026)

The existing Cloudflare Worker is named \`myjerseyecosystem\`. It now has a real JavaScript Worker entrypoint (\`src/worker.mjs\`) and an explicitly curated static-assets directory (\`dist/\`). It serves all approved UI files unchanged; no Python gateway, tests, secrets, or internal source are published as static assets.

**Deployment:** Cloudflare Workers Builds must be connected to this GitHub repository's \`main\` branch, with project root \`/\` and deploy command \`npx wrangler deploy\`. The approved \`dist/\` files are committed, so no Cloudflare build command is required. For future UI changes, run \`node scripts/build-cloudflare.mjs\` and commit matching \`dist/\` updates; GitHub CI fails if the mirror is stale.

**Runtime variables and secrets — set in Cloudflare > Workers & Pages > myjerseyecosystem > Settings > Variables and Secrets, after the first Worker-script deployment:**

| Name | Type | Purpose |
| --- | --- | --- |
| \`ARTBOARD_V031_URL\` | Text | \`https://artboard-ai-resolution-independent-production.up.railway.app\` |
| \`ARTBOARD_V031_TOKEN\` | **Secret** | Same secret as Railway's \`ARTBOARD_API_KEY\` (never commit or paste publicly) |
| \`MYJERSEY_ACCESS_TOKEN\` | **Secret** | Separate 32+ character private workspace access key, entered into the existing frontend Connect Gateway dialog |
| \`MYJERSEY_ARTBOARD_PRINCIPAL\` | Text | Stable, server-configured authenticated operator identity (for private single-operator testing, e.g. \`myjersey-operator\`) |

No additional Railway \`Myjersey-Gateway\` is needed **for Artboard only**: the Cloudflare Worker implements the existing \`/api/status\` and Artboard-only \`/api/engine/artboard/...\` contract, forwarding a server-side bearer token and principal. Other engines remain \`not_configured\`, and unsupported routes are rejected. A legacy \`gateway.py\` is still available for local tests or a separate future backend.

**Important:** The workspace access key in an operator's browser is sufficient only for a private prototype. For public multi-user launch, replace it with per-user authenticated sessions, rate limits, durable queues and per-user authorization. A green build proves only deployment readiness, not live OpenRouter image-generation quality.

**Verify:** Open the Cloudflare frontend, click Connect Gateway, enter the *workspace* key (not Artboard's token), confirm Artboard shows online from a live readiness check, then test a real artwork project. Without runtime secrets \`/api/status\` responds with 503 rather than faking an online engine.
