# My Jersey Ecosystem

**Atherious Labs · Frontend + private backend gateway · 31 October 2026**

This project replaces the former screenshot-overlay frontend. The UI is native HTML, CSS and JavaScript, rebuilt against the supplied My Jersey/Atherious Labs reference screens with the same deep-navy, electric-cyan, violet and gold visual language. It does **not** include fabricated jobs, sample usage, credit balances, generated outputs, server-online badges, recent files, or artificial progress animation.

## Workspaces

- Reference-aligned responsive navigation with Home first, Overview immediately below Home, and all four workspaces, Emergency Tools, Work History, Add Credits, Users, Support, Get Support, Report a Problem and Settings. It becomes a hamburger drawer on compact screens.
- The default Home landing page now features four highlighted tool-card illustrations, small explanatory workflow strips and real engine-aligned labels; Overview appears immediately below Home in navigation. The redundant Tool Overview route is removed.
- Atherious Labs, My Jersey, Production Studio, Frame Forge AI, AssetsX AI and Autofly SVG brand assets used throughout the header, sidebar, workspace ribbons and footer.
- Production Studio offers Standard and Fast. The other tool modes map to their existing `quality` and `cost_effective` values.
- Frame Forge retains its three real mockup and three real video template IDs, now illustrated with optimized WebP crops from the user's approved design references. These are static reference artwork, not generated output.
- Autofly remains a one-click artwork orchestration workflow and does not duplicate Frame Forge templates.
- Production Studio provides Input, Production and Export at `/production-studio/`. The same workflow creates front and back artwork, verifies both EPS files and provides their downloads and a Master ZIP.
- Credits, users, history, emergency and support submission screens fail closed until their real backends are connected; they do not show invented balances, members, jobs, providers or ticket confirmations.

## Backend contract mapping

| Workspace | Source | Real user-facing operations |
| --- | --- | --- |
| Production Studio | `production-studio/` | `POST /api/studio/jobs` starts a paired front/back production. Cloudflare records the job and serves its measured report, preview and files after verification. |
| Frame Forge AI | `nafiulnahid17/Frameforge_myjerseyengine` commit `3e9b262` | `POST /api/frameforge/jobs/mockup` using 1 of **3** real bundled mockup templates; optional `POST /api/frameforge/jobs/{id}/video` using 1 of **3** real bundled video templates. 10–30-second duration. File download only after `output_ready`. |
| AssetsX AI | `nafiulnahid17/assetxengine` commit `4e7b09d` (v0.1.0) | `POST /v1/assets` → `GET /v1/assets/{id}` analysis → optional selected-element and basic edit operations → `POST /v1/jobs` → validated outputs. Does not claim advanced generative editing or native font modification. |
| Autofly | `nafiulnahid17/autoflyengine_myjersey` commit `ddfd75e` | One-click artwork orchestration from a text brief, one image clearly containing front+back, or separately uploaded front+back. Actual endpoints `/api/autofly/jobs/from-brief`, `/from-combined`, `/from-panels`. **No template picker, no separate mockup/video engine.** |

Autofly uses its own backend. Image-based Autofly workflows use front and back input.

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

Open `http://127.0.0.1:8765`. The Python gateway uses the workspace access key for its engine APIs. Studio previews locally with its pending connection state, while production runs on the Cloudflare Worker.

The standalone HTML contains a local ecosystem preview. Its Production Studio entry opens the Cloudflare workspace.

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

## Cloudflare deployment

The existing Worker is `myjerseyecosystem`. The default checked-in build serves the ecosystem and the new Studio UI. The Studio shows its pending connection state until the production bindings and secrets are configured. The previous Artboard entry URLs forward to `/production-studio/`.

Build and check the tracked deployment files with Node 22.12+:

```bash
npm --prefix production-studio ci
npm --prefix production-studio run build
node scripts/build-cloudflare.mjs
node scripts/build-cloudflare.mjs --check
node scripts/build-standalone.mjs
node --test tests/test_worker.mjs
```

Deploy the default build with `npx wrangler deploy`. See [Production Studio setup](production-studio/README.md) for the account-connected configuration and original runtime package.
