# Prompt Inventory (initial)

## Deep Research
- `brain/deep_research/dialogue_system.py`
  - `SYSTEM_PROMPT` – main multi-step workflow instructions for research agent.
  - `CRITIC_SYSTEM_PROMPT` – critic mode instructions evaluating drafts.
- `brain/deep_research/orchestrator.py`
  - `NOTE_SYSTEM_PROMPT` – summarizer prompt for research notes.
  - `CURATOR_SYSTEM_PROMPT` – selects commentaries and sources.
- `brain/deep_research/progress_analyzer.py`
  - `BASE_PROMPT` – progress completeness checklist with stop conditions.
- `brain/research_planner.py`
  - `SYSTEM_PROMPT_INITIAL_PARSER` – parses user request into structured plan.

## Study / Personas
- `personalities.json` (backend) + `astra-web-client/public/personalities.json`
  - Per-persona `system_prompt` arrays (default, rabbi, eva, etc.).
- `brain/main.py` (talmud_json flow)
  - Local doc.v1 formatting instructions for `chevruta_talmud` personality.

## Misc
- `brain/deep_research/dialogue_system` – additional inline prompts when invoking tools (e.g., `CRITIQUE_PROMPT`, TODO confirm).
- Search pending in `learning`, `progress_analyzer`, `study_state` for small one-off prompts.

_Updated 2025-09-26 – completeness TBD (TODO: scan `brain/learning`, `brain/deep_research/*`, `brain/study_utils`)._
