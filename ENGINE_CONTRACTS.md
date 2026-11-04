# Verified Engine Contracts

| Tool | API mode enums | Core workflow | Supported export choices in this UI |
| --- | --- | --- | --- |
| Artboard AI v0.3.1 | `quality`, `cost_effective` | project → upload → prepare 1/2 independently visible body panels → AI production → export | `svg`, `pdf`, `eps`, `png`, `zip` |
| Frame Forge v0.1.0 | `quality`, `cost_effective` | selected input + optional logo → 3 **real** mockup templates → OpenRouter image → optional 3 **real** video templates, 10–30s | mockup file, optional MP4 |
| AssetsX v0.1.0 | `quality`, `cost_effective` | upload → analyze elements → optional supported edit → trace using strategy → export | `png`, `transparent_png`, `svg`, `eps`, `pdf`, `ai_handoff`, `zip` |
| Autofly v0.1 | `quality`, `cost_effective` | one-click Artboard job using brief, front+back combined input, or separate front+back files | `svg`, `eps`; bundle from Artboard |

## Artboard Quality Mode — backend commit `5654d4c`

- Existing `Source Analysis → Engine → Artwork Generator` handoff is preserved.
- Quality routing: Qwen3 VL Instruct for source/semantic analysis, Seedream 5.0 Pro for reference artwork, GPT-5 Nano for post-vector AI review.
- New backend progress events include semantic guidance received by vector engine and AI vector review #1/#2; frontend maps these to **Vectorization** and **Validation** without inventing live AI pixels.
- The project response publishes `validation.ai_vector_review`: `status` (`PASS`, `FINAL_FIX_TECHNICAL_PENDING`, or `REVIEW_REQUIRED`), actual AI review `rounds`, engine `fixes`, and `accepted_artwork_source`. Final fix #2 may pass technical validation without a third AI review; the UI MUST NOT label that as an AI PASS.
- **Export gate:** Quality Mode requires `true_vector_ready === true`, `validation.status === PASS` and review status `PASS` or `FINAL_FIX_TECHNICAL_PENDING`. No review metadata means **not verified**, not PASS.
- `artwork_resolution[part_id].requested_dimensions` and `requested_tier` represent requested Seedream pixels (up to ~4.6MP); `received_dimensions` and `received_megapixels` represent actual image output. No 4K/600 DPI native claim may be inferred.
- `resume_from_ai=true` reuses saved generated artwork and avoids **image generation**, but may perform billed semantic/review calls. Fixes modify selected vector regions only.
- Normal Mode remains on its existing route; the Quality review metadata is not a prerequisite there.

## Frame Forge template IDs — exact from source

Mockup: `mockup_luxury_float`, `mockup_stadium_hero`, `mockup_editorial_launch`.

Video: `video_luxury_360`, `video_stadium_reveal`, `video_kinetic_social`.

## Known constraints

Artboard v0.3.1 is not the same REST API as the legacy Artboard used by Autofly. Existing Autofly's legacy integration must be adapted at the backend to support Artboard v0.3.1. For old combined/panels Autofly jobs both front/back must be present. Current AssetsX cannot provide font file modification, semantic edit prompting, and native Illustrator .ai export. All engine credentials must be provided on a private server; not in static JS. Live generation has not been verified by this frontend source delivery.
