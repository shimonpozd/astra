"""Range handling utilities for study segments."""

from __future__ import annotations

from typing import Any, Dict, Optional

from .errors import RangeNotFound, RangeValidationError


def try_load_range(ref: str, *, loader: Any) -> Optional[Dict[str, Any]]:
    """Attempt to load a single-range payload for ``ref``.

    Placeholder implementation delegates to the provided loader callable.
    """

    if not ref:
        raise RangeValidationError("Empty reference provided", ref=ref)
    result = loader(ref)
    if result is None:
        raise RangeNotFound(f"Range for '{ref}' not found", ref=ref)
    return result


def handle_inter_chapter(ref: str, *, loader: Any) -> Dict[str, Any]:
    """Handle inter-chapter references via the supplied loader.

    The final implementation will orchestrate window stitching; today we
    simply proxy to the loader to keep early tests focused on contracts.
    """

    return try_load_range(ref, loader=loader)


def handle_jerusalem_talmud(ref: str, *, loader: Any) -> Dict[str, Any]:
    """Handle Jerusalem Talmud triple-index references."""

    return try_load_range(ref, loader=loader)
