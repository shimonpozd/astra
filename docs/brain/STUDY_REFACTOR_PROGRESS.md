# Study Refactor Progress

## Current Focus (2025-10-14)
- Run the modular facade and daily loader behind feature flags in staging while replaying parity fixtures and monitoring telemetry.
- Wire `study.daily.*`, `study.bookshelf.*`, and `study.prompt.*` counters plus dashboards/alerts.
- Finalise documentation and runbooks for toggling study feature flags ahead of rollout.

## Next Up
- Flip facade/daily loader flags on by default once metrics burn-in is stable and prune redundant legacy writes/logging.
- Expand end-to-end coverage (websocket daily polling, bookshelf fallback) exercising the modular stack.
- Schedule downstream comms for deprecating remaining `study_utils` shims and updating the admin UI.

## Action Tracker
| Item | Owner | Target |
| --- | --- | --- |
| Stage `daily.modular_loader_enabled` with telemetry dashboards | Ops + Study | 2025-10-16 |
| Ship `study.bookshelf.*` counters and cache load tests | Backend | 2025-10-17 |
| Align websocket/admin docs with modular telemetry | Docs | 2025-10-17 |
| Consolidate facade error handling + retire legacy logs | Study Core | 2025-10-18 |
| Publish prompt trimming snapshot storage plan | Observability | 2025-10-18 |

## Rollout Checklist
- [ ] Stage facade and modular loader flags in staging with dashboards watching `study.daily.*`, `study.bookshelf.*`, and `study.prompt.*` counters.
- [ ] Persist prompt trimming snapshots for audits once observability wiring lands.
- [ ] Finish integration coverage for `/study/set_focus`, `/study/bookshelf`, and daily polling flows through the modular stack.
- [ ] Publish the admin runbook updates covering new knobs and feature flag sequencing.
- [ ] Remove redundant legacy logging/writes after telemetry parity holds for a full release cycle.

## Risk Watchlist
- Behaviour drift during flag rollouts -> keep parity fixtures replayed in staging until counters stabilise.
- Lock contention regressions -> alert on `study.daily.lock_conflict` and monitor retry histogram baselines.
- Redis key sprawl -> vet new keys via `StudyRedisRepository` catalogue before rollout.
- Prompt overruns -> block rollout until trimming metrics demonstrate steady state under load.
- Admin misconfiguration -> gate rollout behind `config_schema.py` validation and spot-check hot-reload events.

## Recent Timeline
### 2025-10-16
- Hooked legacy facade bookshelf responses into `study.logging.log_bookshelf_built`, ensuring the new Prometheus counters emit even when the feature flags remain off.
- Captured the matched focus ref during filtering so instrumentation reflects segment-level fallbacks before dashboards land.

### 2025-10-14
- Introduced `study/logging.py` and migrated the facade window path to structured `study.window.built` events plus prompt trimming logs.
- Integrated `prompt_builder.py` + `prompt_budget.py` with the facade's token counter factory; prompt payloads now enforce budgeting in unit tests.
- Added typed config loader + hot-reload tests (`config_loader.py`, `test_study_config_loader.py`) alongside broader unit coverage (`test_study_facade.py`, `test_study_redis_repository.py`, `test_daily_loader.py`, `test_bookshelf_service.py`).
- Captured additional parity fixtures (`docs/brain/fixtures/Exodus_2-1.json`, etc.) and refreshed `test_daily_text_parity.py` to cover spanning/inter-chapter/JT flows.

### 2025-10-13
- Replaced regex-based background scheduling with `DailyLoader.remaining_plan` metadata, persisted remaining plans, and extended async coverage for the modular loader.
- Added Redis-backed caching and typed error handling to `BookshelfService`, plus unit coverage for caching/fallback flows.
- Feature-flagged the thin facade (`study/service.py`), routing window/daily/bookshelf delegations through modular collaborators when enabled and wiring prompt budgeting scaffolding.
- Introduced the modular `daily_text` builder for full daily payloads and filtered tool call directives from streamed responses.
- Expanded `test_daily_text_parity.py` with fixtures (Genesis 1, Genesis 1:1-2:3, Zevachim 24, Jerusalem Talmud Sotah 5:4:3-6:3) to lock parity before wider rollout.
- Legacy study service window calls now consult the modular navigator and dynamic chapter lengths, fixing "one pasuk only" regressions for refs like Exodus 2:1.

### 2025-10-12
- **Daytime** Moved background segment loading into `DailyLoader` with repository-driven locks/idempotency; scheduled `DailyLoader.load_background` via `StudyService`; added unit coverage for the loader and repository helpers.
- **Evening** Scoped next steps for `DailyLoader.load_initial`, feature-flagged facade wiring, and legacy shim trimming; synced roadmap notes in `STUDY_REFACTOR_PLAN.md`.
- **Late evening** Added modular `DailyLoader.load_initial`, feature-flag toggle in config, integrated the loader into `StudyService` daily path, and added async unit coverage for the new flow.

### 2025-10-11
- **Daytime** Added loading-flag helpers to `StudyRedisRepository`; ported `_load_remaining_segments_background` to repo APIs; switched daily scheduling to use repo-based status checks.
- **Evening** Planned Phase 3 follow-up covering loader migration, lock/idempotency helpers, and unit coverage expectations.

### 2025-10-10
- **Daytime** Implemented `StudyRedisRepository` (locking, TTL, cache accessors) and upgraded `DailyLoader` batch planning plus tests; began migrating legacy daily flows to the repository.
- **Evening** Updated legacy `StudyService` to store daily top refs/segments via the repository, added `clear_segments`, and refreshed the cleanup backlog for remaining loader/facade work.

## Earlier Milestones
### 2025-10-09
- Captured phase-by-phase status in the plan, highlighted cleanup backlog (logging helper migration, Redis repository work), and documented bookshelf integration/config hot-reload expectations ahead of Phase 4.

### 2025-10-07
- Delivered `StudyConfig` loader/validation with hot-reload wiring, modular study package skeleton, structured `StudyError` taxonomy, prompt budget helpers, `BookshelfService` scaffold + shim, navigator extraction, config-bound window handling, and unit coverage for config/booking modules.

### 2025-10-05
- Ported range handling into `study/range_handlers.py`, moved formatting helpers into `study/formatter.py`, updated `study_utils.get_text_with_window` to rely on new helpers, and added unit coverage for the bookshelf service.
