"""Structured logging helpers for the study service."""

from __future__ import annotations

import logging
from typing import Any, Mapping, MutableMapping, Optional

_LOGGER = logging.getLogger("brain_service.study")


def _emit(level: int, event: str, *, extra: Optional[Mapping[str, Any]] = None) -> None:
    payload: MutableMapping[str, Any] = {"event": event, "source": "study"}
    if extra:
        payload.update(extra)
    _LOGGER.log(level, event, extra=payload)


def log_window_built(ref: str, segments: int, window_size: int, duration_ms: float) -> None:
    _emit(
        logging.DEBUG,
        "study.window.built",
        extra={
            "ref": ref,
            "segments": segments,
            "window_size": window_size,
            "duration_ms": duration_ms,
        },
    )


def log_daily_initial(ref: str, loaded: int, total: int, duration_ms: float) -> None:
    _emit(
        logging.INFO,
        "study.daily.initial_loaded",
        extra={
            "ref": ref,
            "segments_loaded": loaded,
            "total_segments": total,
            "duration_ms": duration_ms,
        },
    )


def log_daily_bg_loaded(ref: str, loaded: int, duration_ms: float, retry: bool = False) -> None:
    _emit(
        logging.DEBUG,
        "study.daily.background_loaded",
        extra={
            "ref": ref,
            "segments_loaded": loaded,
            "duration_ms": duration_ms,
            "retry": retry,
        },
    )


def log_range_detected(ref: str, kind: str) -> None:
    _emit(logging.DEBUG, "study.range.detected", extra={"ref": ref, "range_type": kind})


def log_bookshelf_built(ref: str, items: int) -> None:
    _emit(logging.INFO, "study.bookshelf.built", extra={"ref": ref, "items": items})


def log_prompt_trimmed(ref: str, removed_tokens: int, remaining_tokens: int) -> None:
    _emit(
        logging.DEBUG,
        "study.prompt.trimmed",
        extra={
            "ref": ref,
            "removed_tokens": removed_tokens,
            "remaining_tokens": remaining_tokens,
        },
    )
