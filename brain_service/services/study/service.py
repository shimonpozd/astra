"""Future thin facade for the study service."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class StudyService:
    """Facade entry point that will orchestrate study domain collaborators."""

    def __init__(
        self,
        sefaria_service: Any,
        index_service: Any,
        redis_client: Any,
        config: Any,
        logger: Any,
    ) -> None:
        self._sefaria_service = sefaria_service
        self._index_service = index_service
        self._redis = redis_client
        self._config = config
        self._logger = logger

    async def get_text_with_window(
        self, ref: str, window_size: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        raise NotImplementedError(
            "Modular study service not yet wired. Use study_service.StudyService instead."
        )

    async def get_full_daily_text(
        self, ref: str, session_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        raise NotImplementedError(
            "Modular study service not yet wired. Use study_service.StudyService instead."
        )

    async def get_bookshelf_for(
        self, ref: str, limit: int = 40, categories: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        raise NotImplementedError(
            "Modular study service not yet wired. Use study_service.StudyService instead."
        )

    async def build_prompt_payload(
        self, ref: str, mode: str, budget: Dict[str, Any]
    ) -> Dict[str, Any]:
        raise NotImplementedError(
            "Modular study service not yet wired. Use study_service.StudyService instead."
        )
