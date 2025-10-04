# Study Service Refactor Plan

## Scope & Context
- Legacy implementation lives in `brain_service/services/study_service.py` (~57k LOC) and `brain_service/services/study_utils.py` (~80k LOC).
- The refactor covers the study flows consumed by StudyDesk/StudyLanding, chat orchestration, and admin tooling.
- REST and websocket routers must continue to call the existing `StudyService` contract without modification.
- New code will live under `brain_service/services/study/` with `service.py` acting as the facade that delegates to modular collaborators.

## Objectives (Non-negotiable)
- Reduce file size and cognitive load by splitting responsibilities into focused modules.
- Make behavior predictable for window navigation, daily loading, bookshelf assembly, and prompt generation.
- Improve testability by favoring pure functions and keeping IO behind thin repositories.
- Stabilize background loading via explicit locking, TTL management, deterministic ordering, and idempotent retries.
- Centralize configuration, logging, metrics, and compatibility contracts beneath a unified `study` namespace.
- Preserve the existing API surface so downstream callers continue to work unchanged.

## Target Architecture

### Directory Layout
```
brain_service/
  services/
    study/
      __init__.py
      service.py            # Facade only: orchestrates collaborators
      parsers.py            # Ref parsing, corpus detection (Tanakh/Mishnah/Talmud)
      navigator.py          # Window neighbors: prev/next generation and validation
      range_handlers.py     # Inter-chapter ranges and Jerusalem Talmud specifics
      daily_loader.py       # Initial and background load; scheduling; lock management
      bookshelf.py          # Commentary shelf: related links plus previews
      formatter.py          # Cleaning HTML, extracting Hebrew, front segments
      redis_repo.py         # All Redis keys/TTL/pipelines (study namespace)
      logging.py            # Structured logging helpers (sampling-ready)
      errors.py             # Study-specific exception taxonomy
      config_schema.py      # Typed configuration definitions and validators
```

`service.py` replaces the current monolithic entry point but remains a thin orchestrator.

### Public Facade
```python
# brain_service/services/study/service.py
class StudyService:
    def __init__(self, sefaria_service, index_service, redis, config, logger):
        ...

    async def get_text_with_window(
        self,
        ref: str,
        window_size: int | None = None,
    ) -> dict | None:
        """Prev/current/next window around ref, TOC-aware and pre-formatted."""

    async def get_full_daily_text(
        self,
        ref: str,
        session_id: str | None = None,
    ) -> dict | None:
        """Full segmentation for daily mode; schedules background loader safely."""

    async def get_bookshelf_for(
        self,
        ref: str,
        limit: int = 40,
        categories: list[str] | None = None,
    ) -> dict:
        """Related/commentators with short previews and graceful fallbacks."""

    async def build_prompt_payload(
        self,
        ref: str,
        mode: str,
        budget: "PromptBudget",
    ) -> dict:
        """LLM payload respecting STM, system prompt, and study content budgets."""

    # Optional orchestration helpers for chat study modes
    async def run_iyun_mode(...): ...
    async def run_girsa_mode(...): ...
```

Routers call only the facade; all IO is delegated to injected collaborators.

### Core Collaborators

#### parsers.py
- `detect_collection(ref) -> Literal["talmud", "bible", "mishnah", ...]` using the Sefaria TOC with regex fallback.
- `parse_ref(ref) -> dict` providing book, chapter, amud/page, verse, and other metadata.

#### navigator.py
- `neighbors(base_ref, count) -> list[dict]` builds prev/next windows with TOC awareness.
- Validates candidate refs through `sefaria_service`; handles amud/page boundaries, chapter edges, and empty segments.

#### range_handlers.py
- `try_load_range(ref) -> dict | None` covers the single-chapter happy path.
- `handle_inter_chapter(ref)` and `handle_jerusalem_talmud(ref)` encapsulate special cases, enforce limits, and return uniform structures.
- Emits `StudyRangeError` subclasses for missing ranges, exceeded limits, or malformed requests.

#### daily_loader.py
- `plan_initial_segments(ref, length) -> list[SegmentSpec]` splits work between initial and background loads.
- `load_initial(plan)` returns segments for the first response; `load_background(session_id, plan, task_id)` enqueues async work guarded by locks plus idempotency keys.
- Uses deterministic `task_id = hash(plan)` to de-duplicate retries and avoid duplicate segments.
- Enforces RPUSH ordering, TTLs, lock release on every path, bounded batch writes, and backpressure when `max_total_segments` is reached.
- Retries transient errors with exponential backoff (configurable) and increments `study.daily.retry` metrics.

#### bookshelf.py
- `get_for(ref, limit, categories) -> dict` fetches related links and previews with ranking/grouping logic.
- Applies preview caps, hydrates small excerpts when available, and degrades gracefully when text is missing.
- Raises `BookshelfUnavailable` when upstream services fail, allowing the facade to fall back to cached summaries.

#### formatter.py
- `clean_html(text) -> str`, `extract_hebrew_only(text) -> str`, and `to_front_segments(raw) -> list[dict]`.
- Normalizes schema fields (`ref`, `heText`, optional `enText`, `position`, metadata) for the front end.
- Guarantees `position` ∈ [0, 1], `meta.empty = True` for blank texts, and `heText = ""` when no content is returned.

#### redis_repo.py
- Owns all Redis interactions under the study namespace.
- Key pattern responsibilities:
  - `study:window:{ref}` – cached window payloads (`StudyWindowPayload`).
  - `daily:sess:{session_id}:segments` – RPUSH list of `DailySegmentPayload` JSON objects.
  - `daily:sess:{session_id}:total` – total segment count (`int`).
  - `daily:sess:{session_id}:lock` – background loader lock flag (`SET NX EX`).
  - `daily:sess:{session_id}:task:{task_id}` – idempotency marker (`SET EX`).
  - `daily:top:{session_id}` – last focused ref payload.
- Documents payload schemas and enforces serialization/deserialization in one place.

#### logging.py
- Structured logger shortcuts such as `log_window_built`, `log_daily_initial`, `log_daily_bg_loaded`, `log_range_detected`, `log_bookshelf_built`, and `log_prompt_trimmed`.
- Defaults to DEBUG for step-level details, INFO for milestones, with optional sampling.

#### errors.py
- Defines `StudyError` base class and typed subclasses (`RangeNotFound`, `NavigationBoundsExceeded`, `DailyLockBusy`, `DailyIdempotencyCollision`, `BookshelfUnavailable`, etc.).
- Provides mapping helpers to convert errors into HTTP or websocket responses.

#### config_schema.py
- Houses typed definitions (Pydantic `BaseModel` or TypedDict) for the `study.*` configuration tree.
- Validates ranges (`size_min <= size_default <= size_max`, etc.) and fails fast when invalid values are encountered.

#### prompt_budget.py (optional helper)
- Encapsulates token/character budget computation for STM, study segments, and system prompts with priority trimming.

## Configuration Surface
```yaml
study:
  window:
    size_default: 5
    size_min: 1
    size_max: 15
  preview:
    max_len: 600
  daily:
    initial_small: 10
    initial_medium: 20
    initial_large: 30
    large_threshold: 50          # verses/segments
    background_delay_ms: 100
    lock_ttl_sec: 900
    redis_ttl_days: 7
    max_total_segments: 500
    retry_backoff_ms: [100, 500, 1000]
    max_retries: 3
    batch_size: 20
  bookshelf:
    top_preview_fetch: 20
    limit_default: 40
    default_categories: []
  logging:
    level_runtime: INFO
    sample_debug_rate: 0.05
  prompt_budget:
    max_total_tokens: 6000
    reserved_for_system: 1000
    reserved_for_stm: 1500
    min_study_tokens: 2000
```
Values come from the admin panel; config updates should hot-reload via the existing config service/pubsub path and be validated through `config_schema.py`.

## Redis Compatibility Contract
- Key formats listed above are stable; changes require a migration note and versioned shims.
- Payload schemas:
  - `StudyWindowPayload`: `{ "ref": str, "window": {"prev": list, "current": list, "next": list}, "generated_at": int }`.
  - `DailySegmentPayload`: `{ "ref": str, "heText": str, "enText": str | null, "position": float, "meta": dict }`.
  - `TopRefPayload`: `{ "ref": str, "updated_at": int }`.
- Redis repo enforces schema serialization; downstream consumers relied upon this contract must not parse raw JSON themselves.
- Background tasks must check `daily:sess:{session_id}:task:{task_id}` to guarantee idempotency before appending segments.

## Prompt Budget Guardrails
- `StudyService.build_prompt_payload` must apply priority trimming: system > STM memory > study segments > bookshelf/context extras.
- Enforce token and character ceilings from `prompt_budget`, logging `study.prompt.trimmed` when content is dropped.
- Add metrics for size distributions to avoid regressions during future prompt changes.

## Migration Map
| Current location | Move to | Notes |
| --- | --- | --- |
| `detect_collection`, `_parse_ref` | `parsers.py` | Expand via TOC; maintain regex fallback. |
| `_generate_and_validate_refs` | `navigator.py` | Pure navigation plus validation only. |
| `get_text_with_window` | `service.py` | Orchestrates parsers, navigator, formatter. |
| `_handle_jerusalem_talmud_range`, `_handle_inter_chapter_range`, `_try_load_range` | `range_handlers.py` | Enforce limits, short-circuit on empties. |
| `_load_remaining_segments_background` | `daily_loader.py` | Use `redis_repo.try_lock()` plus RPUSH and idempotency markers. |
| `get_full_daily_text` | `service.py` | Delegates to range handlers, daily loader, formatter. |
| Bookshelf/preview helpers | `bookshelf.py` | Apply preview caps and graceful fallbacks. |
| HTML cleanup and Hebrew extraction | `formatter.py` | Centralize for unit testing. |
| Direct Redis calls | `redis_repo.py` | Single key catalogue plus TTL policy. |
| Error strings sprinkled across modules | `errors.py` | Replace with typed exceptions and mapper. |

## Implementation Plan

### Phase 1 - Scaffolding (PR 1)
- Create `services/study/` with stubs and wiring.
- Move read-only helpers (`parsers.py`, `formatter.py`) first.
- Introduce `redis_repo.py` to wrap existing Redis calls without behavior changes.
- Add `logging.py` helpers and replace trivial "emoji logs" with structured messages.
- Add `config_schema.py` for typed configuration validation.
- Acceptance: unit tests pass; routers untouched; config validation covers defaults.

### Phase 2 - Navigation and Ranges (PRs 2-3)
- **2a - navigator.py**: move prev/next generation and validation; ensure parity with legacy logic.
- **2b - range_handlers.py**: extract Jerusalem Talmud and inter-chapter logic; add config limits; return uniform payloads; raise typed errors.
- Acceptance: integration tests cover same-chapter, inter-chapter, and JT refs.

### Phase 3 - Daily Loader (PR 4)
- Add `daily_loader.py` for background loading orchestration.
- Use `redis_repo.try_lock`/`release_lock`, RPUSH plus EXPIRE, idempotency markers, and TTL refresh for top refs.
- Plan initial versus background segments based on `large_threshold`; enforce `max_total_segments`, batching, and backpressure exceptions.
- Acceptance: no duplicate background jobs; ordering preserved; TTLs applied; retries logged.

### Phase 4 - Bookshelf (PR 5)
- Extract bookshelf logic into `bookshelf.py`.
- Cap preview fetches at `top_preview_fetch`; provide consistent fallbacks; raise `BookshelfUnavailable` on failure.
- Optionally add small Redis cache through `redis_repo`.
- Acceptance: `/study/bookshelf` output matches legacy; degraded sources respond faster; metrics recorded.

### Phase 5 - Thin Facade and Cleanup (PR 6)
- Keep `service.py` as orchestration only; remove direct Redis calls.
- Delete or deprecate `study_utils.py`, keeping only temporary wrappers with `DeprecationWarning` pointing to new modules.
- Register central exception handler mapping `StudyError` subclasses to API responses.
- Acceptance: all endpoints function; structured logs in place; tests remain green; deprecation warnings emitted exactly once per process.

### Phase 6 - Prompt Budget & Observability (PR 7)
- Introduce `prompt_budget.py` and wire budgets into `StudyService`.
- Add metrics counters: `study.daily.lock_conflict`, `study.daily.retry`, `study.range.fallback`, `study.bookshelf.miss`, `study.prompt.trimmed`.
- Surface alerts or dashboards for lock conflicts and retries.
- Acceptance: metrics exposed; prompt trimming validated with snapshot tests.

### Milestone Pull Requests
1. `scaffold(study)` - create modules, move parsers/formatter, add redis/logging helpers, typed config.
2. `feat(study): navigator extraction`.
3. `feat(study): range handlers with JT support`.
4. `feat(study): daily loader with locking, idempotency, and backpressure`.
5. `feat(study): bookshelf service + preview caps`.
6. `chore(study): thin facade, study_utils deprecation, centralized errors`.
7. `feat(study): prompt budget, metrics, observability`.

## Testing Strategy

**Unit Tests**
- `parsers`: diverse ref shapes (amud boundaries, verse styles).
- `navigator`: neighbors across chapter/amud boundaries (mock Sefaria).
- `range_handlers`: inter-chapter spans, Jerusalem Talmud triple indexes, empty segment limits.
- `formatter`: HTML cleanup, Hebrew extraction, segment schema normalization.
- `redis_repo`: key patterns, TTLs, RPUSH ordering, lock lifecycle, idempotency markers.
- `daily_loader`: retry/backoff logic, batching, backpressure enforcement.
- `errors`: mapping helpers to HTTP responses.
- `config_schema`: acceptance of valid configs and rejection of invalid ranges.
- `prompt_budget`: trimming priority, token accounting, metric emission.

**Integration Tests**
- `/study/set_focus`: non-empty windows, boundary behavior, structured errors for invalid refs.
- `/study/bookshelf`: stable counts, preview presence, fallback on upstream failure.
- Daily mode: initial segments rendered; background load appends correctly; lock and retry paths exercised with mocks.
- Prompt-building path: ensure trimmed outputs honor budgets and still produce valid payloads.

**Load / Perf (optional)**
- 50 concurrent daily loads -> no duplicate background tasks; latency within current SLOs; lock conflict rate < 1%.
- High-volume prompt building -> trimming metrics recorded; budgets not exceeded.

## Logging & Metrics
- Levels: DEBUG for steps, INFO for milestones, WARN/ERROR for faults.
- Standard fields: `ref`, `session_id`, `range_type`, `segments_loaded`, `duration_ms`, `source="study"`, `task_id` for background jobs.
- Key events: `study.window.built`, `study.range.detected`, `study.daily.initial_loaded`, `study.daily.background_loaded`, `study.daily.retry`, `study.bookshelf.built`, `study.bookshelf.miss`, `study.prompt.trimmed`.
- Add counters/histograms: segments loaded, background job duration, lock conflicts, retry counts, prompt size distributions.
- Integrate alerting thresholds for repeated lock conflicts or retries above baseline.

## Admin Panel Controls
Expose the following runtime knobs under `study.*`, all hot-reloadable with a "diff before apply" UX and validated through `config_schema.py`:
- `study.window.size_default`, `size_min`, `size_max`
- `study.preview.max_len`
- `study.daily.initial_small`, `initial_medium`, `initial_large`
- `study.daily.large_threshold`
- `study.daily.background_delay_ms`
- `study.daily.lock_ttl_sec`
- `study.daily.redis_ttl_days`
- `study.daily.max_total_segments`
- `study.daily.retry_backoff_ms`
- `study.daily.max_retries`
- `study.daily.batch_size`
- `study.bookshelf.top_preview_fetch`
- `study.bookshelf.limit_default`
- `study.bookshelf.default_categories`
- `study.logging.level_runtime`
- `study.logging.sample_debug_rate`
- `study.prompt_budget.max_total_tokens`
- `study.prompt_budget.reserved_for_system`
- `study.prompt_budget.reserved_for_stm`
- `study.prompt_budget.min_study_tokens`

## Error Handling Strategy
- Raise typed `StudyError` subclasses from collaborators; allow facade to translate into HTTP status codes (e.g., `RangeNotFound -> 404`, `DailyLockBusy -> 202` with retry headers).
- Central exception handler should log at WARN for expected errors and ERROR for unexpected ones.
- Include correlation identifiers (session_id, task_id) in error logs.

## Deprecation Path for `study_utils.py`
- Replace functions with thin wrappers that import from the new modules and emit `DeprecationWarning` once per process.
- Provide migration table documenting new call sites.
- Remove wrappers after one release cycle once downstream consumers migrate.

## Pull Request Checklist
- [ ] Config values validated via `config_schema.py`; new defaults documented.
- [ ] All Redis interactions use `redis_repo` and comply with payload contracts.
- [ ] Typed errors raised and mapped; no ad-hoc string exceptions remain.
- [ ] Metrics/log events added for new flows; dashboards updated if applicable.
- [ ] Prompt budget tests cover trim/no-trim scenarios.
- [ ] Backpressure and retry logic tested (unit + integration).
- [ ] Deprecation shims verified; warnings emitted during test runs.
- [ ] Documentation (`STUDY_REFACTOR_PLAN.md`, admin guides) updated.

## Risks & Mitigations
- **Behavior drift during extraction** -> add or expand integration tests before each phase.
- **Lock starvation or duplicate background loads** -> enforce idempotency markers, retries with backoff, and alert on `study.daily.lock_conflict`.
- **Redis key sprawl** -> centralize patterns in `redis_repo`, document TTLs, and add lint checks for direct Redis usage.
- **Log noise** -> enforce log level policy and sampling from Phase 1 onward.
- **Prompt overruns** -> guard with budgets and emit trimming metrics for monitoring.
- **Misconfigured admin values** -> fail fast via `config_schema.py` validation and surface errors in admin UI.

## Quick Wins (Immediate Patches)
```diff
# Ensure natural ordering for segment lists and enforce TTL
- await redis.lpush(key, json.dumps(seg, ensure_ascii=False))
+ await redis.rpush(key, json.dumps(seg, ensure_ascii=False))
+ await redis.expire(key, 3600 * 24 * 7)

# Background loader lock with SET NX EX, idempotency marker, and safe release
+ task_id = hash_plan(plan)
+ already = await redis.get(task_key)
+ if already:
+     return
+ got = await redis.set(lock_key, "1", nx=True, ex=cfg.study.daily.lock_ttl_sec)
+ if got:
+     try:
+         await redis.set(task_key, "1", ex=cfg.study.daily.lock_ttl_sec)
+         await load_bg(...)
+     finally:
+         await redis.delete(lock_key)

# Demote chatty logs
- logger.info("?? loading %s", ref)
+ logger.debug("study.load start ref=%s", ref)

# TTL refresh for daily top pointer
+ await redis.set(top_key, json.dumps({"ref": ref}), ex=3600 * 24 * cfg.study.daily.redis_ttl_days)
```

## Definition of Done
- Public API remains unchanged; routers do not require updates.
- `study_service.py` becomes a thin facade; legacy helpers are deleted or shimmed.
- All IO flows through `redis_repo`; background tasks use locks, idempotency markers, RPUSH, and TTL enforcement.
- Structured logging, metrics, prompt budgets, and admin knobs are active.
- Unit, integration, and lint/test suites pass; documentation reflects the new layout.
- Deprecation warnings guide downstream consumers until shims are removed.
