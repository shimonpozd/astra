import types
import sys

import pytest

from brain_service.services.study.daily_text import build_full_daily_text


class StubSefaria:
    async def get_text(self, ref: str):  # pragma: no cover - not used directly in tests
        raise AssertionError("unexpected direct get_text call: {ref}")


@pytest.mark.anyio
async def test_build_full_daily_text_simple(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_try_load_range(_service, _ref):
        return {
            "ref": "Genesis 1",
            "text": ["En 1", "En 2"],
            "he": ["He 1", "He 2"],
            "title": "Genesis",
            "indexTitle": "Bereshit",
            "heRef": "בראשית א",
        }

    monkeypatch.setattr(
        "brain_service.services.study.daily_text.try_load_range",
        fake_try_load_range,
    )

    payload = await build_full_daily_text("Genesis 1", StubSefaria(), object())
    assert payload
    assert payload["focusIndex"] == 0
    assert len(payload["segments"]) == 2
    first = payload["segments"][0]
    assert first["ref"].endswith(":1")
    assert first["heText"] == "He 1"
    assert first["metadata"]["title"] == "Genesis"


@pytest.mark.anyio
async def test_build_full_daily_text_spanning(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_try_load_range(_service, _ref):
        return {
            "ref": "Zevachim 24",
            "text": [["En a1", "En a2"], ["En b1"]],
            "he": [["He a1", "He a2"], ["He b1"]],
            "spanningRefs": ["Zevachim 24a", "Zevachim 24b"],
            "title": "Zevachim",
            "indexTitle": "Zevachim",
            "heRef": "זבחים כד",
            "isSpanning": True,
        }

    monkeypatch.setattr(
        "brain_service.services.study.daily_text.try_load_range",
        fake_try_load_range,
    )

    payload = await build_full_daily_text("Zevachim 24", StubSefaria(), object())
    assert payload
    segments = payload["segments"]
    assert len(segments) == 3
    assert segments[0]["ref"].endswith("24a:1")
    assert segments[-1]["ref"].endswith("24b:1")


@pytest.mark.anyio
async def test_build_full_daily_text_inter_chapter_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_try_load_range(_service, _ref):
        return None

    async def fake_handle_inter(range_ref, *_args, **_kwargs):
        return {"ref": range_ref, "segments": ["ok"], "focusIndex": 0, "he_ref": None}

    monkeypatch.setattr(
        "brain_service.services.study.daily_text.try_load_range",
        fake_try_load_range,
    )
    monkeypatch.setattr(
        "brain_service.services.study.daily_text.handle_inter_chapter_range",
        fake_handle_inter,
    )

    payload = await build_full_daily_text("Genesis 1:1-2:3", StubSefaria(), object())
    assert payload
    assert payload["segments"] == ["ok"]


@pytest.mark.anyio
async def test_build_full_daily_text_returns_none_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_try_load_range(_service, _ref):
        return None

    async def fake_handle_inter(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "brain_service.services.study.daily_text.try_load_range",
        fake_try_load_range,
    )
    monkeypatch.setattr(
        "brain_service.services.study.daily_text.handle_inter_chapter_range",
        fake_handle_inter,
    )
    monkeypatch.setattr(
        "brain_service.services.study.daily_text.handle_jerusalem_talmud_range",
        fake_handle_inter,
    )

    payload = await build_full_daily_text("Genesis 1", StubSefaria(), object())
    assert payload is None
