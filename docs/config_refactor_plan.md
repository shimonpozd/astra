# Configuration Control Refactor Plan

## Vision
Bring all runtime knobs (LLM, voice, memory, study, personalities) under a single, observable control plane that can be inspected and adjusted from both CLI and the web client without editing scattered files.

## Guiding Principles
- **Single Source of Truth:** move defaults + overrides into one configuration registry, and generate env/launch artifacts from it.
- **Incremental Adoption:** maintain compatibility with current services while migrating consumers.
- **Observability & Safety:** every change is auditable, validated, and can be rolled back.
- **UI-First Experience:** expose settings through an admin panel backed by APIs, not by file edits.

## Phase Overview
1. **Phase 0 – Discovery & Inventory**
   - [x] Catalogue all configuration consumers (env vars, JSON files, CLI flags).
   - [x] Map each key to owner/service and desired grouping.
   - [x] Decide TOML schema shape for the unified config store.

2. **Phase 1 – Core Config Loader**
   - [x] Implement `config/` package that loads defaults + overrides and exposes typed access.
   - [ ] Add unit tests for merge semantics (defaults, overrides, env fallbacks).
   - [x] Switch one non-critical service (e.g. memory) to the loader behind a feature flag.

3. **Phase 2 – Runtime Config API**
   - [ ] Add authenticated `/admin/config` endpoints (GET schema/current, PATCH updates).
   - [ ] Implement hot-reload hooks for updated domains (LLM, voice, research, etc.).
   - [ ] Provide audit logging for every change.

4. **Phase 3 – Launcher & CLI Alignment**
   - [ ] Make `start_cli.py` / `launcher.py` read & write via the config API instead of `.astra_last_config.json`.
   - [ ] Ensure spawned services inherit generated env/flags from the loader.
   - [ ] Remove redundant config artifacts after migration.

5. **Phase 4 – Web Admin Panel**
   - [ ] Build read-only settings dashboard in the web client (ModelSettings or /admin route).
   - [ ] Add editing workflows (form validation, test buttons, confirmation dialogs).
   - [ ] Integrate personality editor with preview + save via API.

6. **Phase 5 – Cleanup & Hardening**
   - [ ] Deprecate legacy config files and update documentation.
   - [ ] Add telemetry/alerts for config drifts or failed reloads.
   - [ ] Conduct end-to-end rehearsal (happy path + failure rollback).

## Assumptions & Open Questions
- Authentication mechanism for admin endpoints (API key vs. session-based) – _TBD_.
- Storage for overrides (local YAML, Redis, or SQL) – _TBD_.
- Rollback strategy (versioned snapshots?) – _TBD_.

## Phase 0 Inventory (working draft)

| Component / Domain | Source(s) | Consumers | Key knobs observed | Pain points / gaps |
| --- | --- | --- | --- | --- |
| Global runtime env | `.env` at repo root (loaded via `dotenv` in `brain/main.py`, `stt/main.py`, `tts/main.py`, `voice-in/main.py`, many scripts) | Brain API, audio stack, tooling scripts | `LLM_PROVIDER`, `LLM_MODEL`, `ASTRA_MODEL_*`, `MEMORY_SERVICE_URL`, `TTS_SERVICE_URL`, `REDIS_URL`, `ASTRA_*` research loop controls, `DRASHA_*`, `VOICE_*` toggles, API keys | Single flat file mixes prod/dev defaults, duplicated keys for memory/STT/TTS, no validation, manual edits only |
| Memory service | `services/memory/app/config.py` (`pydantic` settings) + `memory/.env` | Memory FastAPI worker | `redis_url`, `qdrant_url`, `openai_api_key`, embeddings provider/model, ingest batching, masking flags | Separate `.env` overrides drift from root `.env`; still requires OpenAI key even when using OpenRouter; no central coordination |
| Personalities | `personalities.json` (root) + duplicated `astra-web-client/public/personalities.json` | Brain state loader, CLI launcher, web persona selector | System prompts, tool flags (`use_sefaria_tools`, `use_mem0_tool`, flow types) | Manual JSON editing, duplication between backend/frontend, no validation, frequent merge conflicts |
| Launcher / CLI | `.astra_last_config.json`, `start_cli.py`, `launcher.py` | Developer workflow when starting services | Remembered selections for persona, LLM provider, `enabled_services`, TTS/STT provider choices | Settings not propagated automatically to services; diverges from `.env`; multiple code paths manipulate same data |
| Brain LLM config | `brain/llm_config.py` env lookups (`OPENROUTER_API_KEY`, `OPENROUTER_API_BASE`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL`) | Brain LLM client factory | Model routing per task, temperature defaults | Hard-coded env lookups with fallbacks; no shared schema for task-specific overrides |
| Deep research + export | `brain/deep_research/*` env (`ASTRA_MAX_RESEARCH_DEPTH`, `ASTRA_CURATOR_MAX_CANDIDATES`, `ASTRA_RESEARCH_NOTE_MAX_CHARS`), `brain/document_export.py` (`DRASHA_*`) | Brain research flow, auto-exporter | Depth/iteration limits, export directory & auto-flag | Scattered constants; defaults disagree with `.env` comments; no runtime visibility |
| Audio stack | `stt/main.py`, `tts/main.py`, `voice-in/main.py` env vars (`ASTRA_STT_PROVIDER`, `WHISPER_*`, `DEEPGRAM_API_KEY`, `ASTRA_TTS_PROVIDER`, `XTTS_*`, `VOICE_*`) | STT microservice, TTS dispatcher, voice-in service | Provider choice, model paths, device, thresholds, streaming toggles | Each service reads directly from env, no shared validation; CLI toggles in `.astra_last_config.json` don’t sync; risky defaults for GPU/paths |
| Frontend config | `astra-web-client` (mostly static) | Web client | Hardcoded `/api` proxy, personalities copy, localStorage `astra_user_id` | Lacks visibility into backend settings; personalities must be redeployed |

### Target configuration schema sketch (draft)

```yaml
llm:
  provider: openrouter
  model: openrouter/x-ai/grok-4-fast:free
  api:
    openrouter:
      api_key: <secret>
      base_url: https://openrouter.ai/api/v1
      referrer: null
      title: null
    openai:
      api_key: <secret>
      organization: null
    ollama:
      base_url: http://localhost:11434
  overrides:
    chat: openrouter/x-ai/grok-4-fast:free
    drafter: openrouter/x-ai/grok-4-fast:free
    critic: openrouter/x-ai/grok-4-fast:free
    planner: openrouter/x-ai/grok-4-fast:free
  parameters:
    temperature: 0.3
    top_p: 0.9

memory:
  redis_url: redis://localhost:6379/0
  qdrant_url: http://localhost:6333
  embeddings:
    provider: ollama
    model: embeddinggemma:300m
    cache_ttl_seconds: 604800
  ingest:
    queue_name: astra_ltm_ingest_queue
    batch_size: 100
    batch_timeout_ms: 500

research:
  default_depth: 5
  max_depth: 2
  curator_max_candidates: 30
  note_max_chars: 3500
  iterations:
    min: 4
    max: 8
    base: 3
    depth_divisor: 5

export:
  drasha:
    dir: exports
    auto_export: true

voice:
  stt:
    provider: whisper
    whisper:
      model_size: medium
      compute_type: float16
      device: cuda
      model_path: models/whisper-large-v2
    deepgram:
      api_key: <secret>
  tts:
    provider: xtts
    xtts:
      api_url: http://localhost:8010
      speaker_wav: speakers/audio.wav
    elevenlabs:
      api_key: <secret>
      voice_id: Rachel
    orpheus:
      api_url: http://localhost:7041
  voice_in:
    streaming_enabled: false
    chunk_duration_ms: 2000
    noise_reduction: false
    normalization: false
    interrupt:
      threshold: 0.7
      min_duration_ms: 300
    vad:
      min_silence_ms: 800

personalities:
  path: personalities/
  default: default
  editor:
    allow_inline_edits: true

launcher:
  enabled_services:
    voice-in: false
    stt: false
    tts: false
  prompts:
    remember_last_selection: true
```

### Ownership mapping (draft)
- **Brain/Research** – `llm`, `research`, `export`, `personalities` (primary owner: brain team).
- **Memory service** – `memory.*` (memory team).
- **Audio stack** – `voice.stt`, `voice.tts`, `voice.voice_in` (audio team).
- **Dev tooling** – `launcher`, CLI integrations (devops/infra).

### Outstanding questions\n- Where to persist overrides (local YAML vs. Redis vs. DB)?\n- Secrets management strategy (env injection vs. encrypted store).\n- How to propagate config versioning to distributed services (Redis pub/sub, etc.).\n
### Configuration ownership (detailed)

| Domain | Representative keys | Primary owner | Notes |
| --- | --- | --- | --- |
| **LLM core** | `LLM_PROVIDER`, `LLM_MODEL`, `ASTRA_MODEL_*`, `OPENROUTER_*`, `OPENAI_API_KEY`, `OLLAMA_*` | Brain team | Drives all task-specific models; requires secure secret storage |
| **Research loop** | `DEFAULT_RESEARCH_DEPTH`, `ASTRA_MAX_RESEARCH_DEPTH`, `ASTRA_CURATOR_MAX_CANDIDATES`, `ASTRA_RESEARCH_NOTE_MAX_CHARS`, `ASTRA_ITER_*`, `ASTRA_CHAIN_OF_THOUGHT`, `DEBUG_DEEP_RESEARCH` | Brain team | Same namespace should govern deep research features |
| **Exports** | `DRASHA_EXPORT_DIR`, `DRASHA_AUTO_EXPORT` | Brain team | Could evolve into generic export settings |
| **Memory service** | `services/memory/app/config.py` fields, `memory/.env` (`redis_url`, `qdrant_url`, `embedding_model_*`, ingest controls) | Memory team | Needs integration with central loader; currently independent |
| **Audio stack - STT** | `ASTRA_STT_PROVIDER`, `WHISPER_*`, `DEEPGRAM_API_KEY` | Audio team | Provider selection toggled via CLI but applied through env |
| **Audio stack - TTS** | `ASTRA_TTS_PROVIDER`, `XTTS_*`, `ELEVENLABS_*`, `ORPHEUS_PROXY_URL`, `TTS_SERVICE_URL` | Audio team | Similar pattern; expect more providers later |
| **Voice-in** | `VOICE_*`, `ASTRA_AGENT_ID` (for routing) | Audio team | Interacts with STT/brain; should share toggles |
| **Services infrastructure** | `REDIS_URL`, `MEMORY_SERVICE_URL`, `TTS_SERVICE_URL`, `QDRANT_URL`, `BRAIN_URL` | Infra/devops | Common baseline for all processes |
| **Personalities** | `personalities/*.json`, `ASTRA_PERSONALITY`, CLI selections | Shared (brain + product) | Needs single registry + UI |
| **Launcher/CLI** | `.astra_last_config.json`, `ASTRA_*_PROVIDER` overrides, CLI prompts | Devops/productivity | Should read/write via central API |
| **Frontend** | `astra-web-client` static copies (personalities, defaults) | Frontend team | Consume config via API instead of baked JSON |

### Outstanding blockers before Phase 1
- **Secrets handling:** need decision on secure storage (e.g., `.env.local` kept for secrets vs. secret manager).
- **Service reload mechanics:** plan for notifying running services after config changes (Redis pub/sub, HTTP webhook, restart policy).
- **Legacy scripts:** numerous `scripts/*` use `load_dotenv(override=True)`; need migration strategy or compatibility layer.
- **Duplication:** `personalities.json` still duplicated; migration path must be defined before new loader to avoid divergence.
### Immediate cleanup candidates
- Deduplicate `personalities.json` (single source + loader for frontend).
- Replace `.astra_last_config.json` with generated config derived from the upcoming central registry.
- Audit memory service requirements: allow non-OpenAI providers without blank `openai_api_key`.
- Document audio service env expectations; align toggles with CLI defaults (`ASTRA_STT_PROVIDER`, `ASTRA_TTS_PROVIDER`).
- Tag root `.env` keys by domain to prepare for schema migration (LLM, voice, research, exports, storage).
## Progress Log
- 2025-09-26 — Initialized plan document and high-level roadmap (Codex).
- 2025-09-26 - Catalogued current configuration sources and pain points (Codex).
- 2025-09-26 - Drafted schema outline and ownership matrix for config domains (Codex).
- 2025-09-26 - Completed ownership mapping and identified blockers for Phase 1 (Codex).
- 2025-09-26 - Verified config loader wiring for memory service (Codex).
- 2025-09-26 - Brain llm_config now reads TOML config when ASTRA_CONFIG_ENABLED (Codex).


### Schema format decision (Phase 0 conclusion)
- Adopt **TOML** for the canonical config files (config/defaults.toml, config/overrides.toml).
  - Reasons: human-friendly, supports comments, merges cleanly, and aligns with Python ecosystem (	omllib in stdlib, pydantic support).
- Secrets (API keys) stay in environment-specific .env.local files or secret manager; TOML stores references (${OPENROUTER_API_KEY} placeholder) but not raw secrets.
- Override precedence order:
  1. config/defaults.toml
  2. Optional config/local.toml (gitignored developer overrides)
  3. Environment variables (for secrets/time-sensitive toggles)
  4. Runtime overrides persisted via admin API (stored in config/overrides.toml or database when introduced).
- Generate .env for legacy consumers via scripts/export_env_from_config.py to smooth migration.

### Migration considerations
- Provide compatibility shim for scripts calling load_dotenv(override=True) until they are refactored to use the loader.
- Introduce logging when legacy env keys diverge from TOML-based config to spot drift early.
- Before Phase 1, document a deprecation timeline for .astra_last_config.json and duplicated personalities.json in the frontend.
- 2025-09-26 - Selected TOML config format and outlined migration plan (Codex).



## Phase 1 Execution Plan

1. **Config directory layout**
   - Create `config/` with: `defaults.toml`, optional `local.toml` (gitignored), `overrides.toml`.
   - Provide sample `defaults.toml` populated from current `.env` values grouped by domain (`llm`, `memory`, etc.).
   - Add `local.toml.example` to illustrate developer overrides.

2. **Loader package (`config/__init__.py`)**
   - Use `tomllib` + `pydantic` to load defaults/local/overrides.
   - Expose `get_settings()` returning nested dataclasses or `pydantic.BaseModel`.
   - Support environment variable interpolation `${ENV_VAR}` for secrets.
   - Provide `to_env()` helper to emit flat env dict for legacy code.

3. **Compatibility shim**
   - Script `scripts/export_env_from_config.py` generating `.env.runtime`.
   - Document usage in README (temporary step while migrating services).

4. **Service integration (Phase 1 scope)**
   - Update memory service (`services/memory/app/config.py`) to optionally use loader when env `ASTRA_CONFIG_ENABLED=true`.
   - Add minimal tests verifying fallback to old behavior when flag is false.

5. **Testing & QA**
   - Unit tests for loader merge order, env interpolation, defaults.
   - Integration test (pytest) ensuring `export_env_from_config.py` outputs expected keys.

6. **Documentation**
   - Update `docs/config_refactor_plan.md` progress & instructions.
   - Add README section “Config refactor Phase 1 (beta)” with steps for developers.
- 2025-09-26 - Created config loader module with TOML merging and env overrides (Codex).
- 2025-09-26 - Memory service loads settings from TOML when ASTRA_CONFIG_ENABLED=true (Codex).
- 2025-09-26 - Drafted prompt registry plan document (Codex).







