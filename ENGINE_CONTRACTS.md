# Verified Engine Contracts

| Tool | API mode enums | Core workflow | Supported export choices in this UI |
| --- | --- | --- | --- |
| Production Studio | `standard`, `fast` | reference upload → front/back artwork → native vector reconstruction → measured validation → export | front EPS, back EPS, Master ZIP |
| Frame Forge v0.1.0 | `quality`, `cost_effective` | selected input + optional logo → 3 **real** mockup templates → OpenRouter image → optional 3 **real** video templates, 10–30s | mockup file, optional MP4 |
| AssetsX v0.1.0 | `quality`, `cost_effective` | upload → analyze elements → optional supported edit → trace using strategy → export | `png`, `transparent_png`, `svg`, `eps`, `pdf`, `ai_handoff`, `zip` |
| Autofly v0.1 | `quality`, `cost_effective` | one-click artwork job using brief, front+back combined input, or separate front+back files | `svg`, `eps`; verified bundle |

## Production Studio

The browser calls `/api/studio/workspace` for connection status and `/api/studio/jobs` for owner-scoped job creation and polling. File URLs are under `/api/studio/jobs/{id}/files/`. Cloudflare Access verifies workspace identity. The Workflow persists stages and exposes separately verified, native process CMYK EPS at 22 × 31 inches per side. The Master ZIP contains both EPS files, artwork JPGs and the technical report.

## Frame Forge template IDs — exact from source

Mockup: `mockup_luxury_float`, `mockup_stadium_hero`, `mockup_editorial_launch`.

Video: `video_luxury_360`, `video_stadium_reveal`, `video_kinetic_social`.

## Known constraints

Autofly uses its existing backend and requires both body panels for its combined or separate panel workflows. AssetsX supports its existing editing and export capabilities. Engine credentials belong in server-side configuration.
