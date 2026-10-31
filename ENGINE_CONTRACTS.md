# Verified Engine Contracts

| Tool | API mode enums | Core workflow | Supported export choices in this UI |
| --- | --- | --- | --- |
| Artboard AI v0.3.1 | `quality`, `cost_effective` | project → upload → prepare 1/2 independently visible body panels → AI production → export | `svg`, `pdf`, `eps`, `png`, `zip` |
| Frame Forge v0.1.0 | `quality`, `cost_effective` | selected input + optional logo → 3 **real** mockup templates → OpenRouter image → optional 3 **real** video templates, 10–30s | mockup file, optional MP4 |
| AssetsX v0.1.0 | `quality`, `cost_effective` | upload → analyze elements → optional supported edit → trace using strategy → export | `png`, `transparent_png`, `svg`, `eps`, `pdf`, `ai_handoff`, `zip` |
| Autofly v0.1 | `quality`, `cost_effective` | one-click Artboard job using brief, front+back combined input, or separate front+back files | `svg`, `eps`; bundle from Artboard |

## Frame Forge template IDs — exact from source

Mockup: `mockup_luxury_float`, `mockup_stadium_hero`, `mockup_editorial_launch`.

Video: `video_luxury_360`, `video_stadium_reveal`, `video_kinetic_social`.

## Known constraints

Artboard v0.3.1 is not the same REST API as the legacy Artboard used by Autofly. Existing Autofly's legacy integration must be adapted at the backend to support Artboard v0.3.1. For old combined/panels Autofly jobs both front/back must be present. Current AssetsX cannot provide font file modification, semantic edit prompting, and native Illustrator .ai export. All engine credentials must be provided on a private server; not in static JS. Live generation has not been verified by this frontend source delivery.
