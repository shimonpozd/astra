from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict

import httpx
import logging


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
BS_ROOT = ROOT / "brain_service"
if BS_ROOT.exists() and str(BS_ROOT) not in sys.path:
    sys.path.insert(0, str(BS_ROOT))

from config import get_config_section
from brain_service.services.sefaria_service import SefariaService
from brain_service.services.sefaria_index_service import SefariaIndexService
from brain_service.services.study_utils import get_full_daily_text
from brain_service.services.study.daily_text import build_full_daily_text


logging.basicConfig(level=logging.WARNING, encoding="utf-8")
study_utils_logger = logging.getLogger("brain_service.services.study_utils")
study_utils_logger.setLevel(logging.WARNING)
study_utils_logger.disabled = True


def _make_filename(ref: str) -> str:
    safe = (
        ref.replace(" ", "_")
        .replace(":", "-")
        .replace("/", "-")
        .replace("|", "-")
    )
    return f"{safe}.json"


class RecordingSefariaService(SefariaService):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records: Dict[str, Any] = {}

    async def get_text(self, tref: str, lang: str | None = None) -> Dict[str, Any]:  # type: ignore[override]
        result = await super().get_text(tref, lang)
        key = f"{tref}|{lang or 'default'}"
        if key not in self.records:
            self.records[key] = result
        return result


async def _capture_ref(
    ref: str,
    sefaria_service: RecordingSefariaService,
    index_service: SefariaIndexService,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {"ref": ref}

    legacy = await get_full_daily_text(
        ref,
        sefaria_service,
        index_service,
        session_id=None,
        redis_client=None,
    )
    modular = await build_full_daily_text(
        ref,
        sefaria_service,
        index_service,
        session_id=None,
        redis_client=None,
    )

    result["legacy"] = legacy
    result["modular"] = modular
    result["sefaria_calls"] = [
        {"ref": key.split("|")[0], "lang": key.split("|")[1], "result": value}
        for key, value in sefaria_service.records.items()
    ]
    return result


async def main(refs: list[str], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    sefaria_cfg = get_config_section("services.brain.sefaria", {}) or {}
    api_url = sefaria_cfg.get("api_url", "https://www.sefaria.org/api/")
    api_key = sefaria_cfg.get("api_key") or None
    cache_ttl = int(sefaria_cfg.get("cache_ttl_seconds", 60) or 60)

    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as http_client:
        sefaria_service = RecordingSefariaService(
            http_client=http_client,
            redis_client=None,
            sefaria_api_url=api_url,
            sefaria_api_key=api_key,
            cache_ttl_sec=cache_ttl,
        )
        index_service = SefariaIndexService(http_client=http_client, sefaria_api_url=api_url, sefaria_api_key=api_key)
        try:
            await index_service.load()
        except Exception as exc:  # pragma: no cover - CLI feedback only
            print(f"  ! failed to load Sefaria TOC: {exc}")
            index_service.toc = []
            index_service.aliases = {}

        for ref in refs:
            ref = ref.strip()
            if not ref:
                continue
            print(f"Capturing {ref!r} ...")
            try:
                sefaria_service.records.clear()
                payload = await _capture_ref(ref, sefaria_service, index_service)
                filename = _make_filename(ref)
                target = output_dir / filename
                target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"  -> wrote {target}")
            except Exception as exc:  # pragma: no cover - CLI feedback only
                print(f"  ! failed to capture {ref}: {exc}")


if __name__ == "__main__":  # pragma: no cover - script entry point
    parser = argparse.ArgumentParser(description="Capture daily text fixtures for parity testing.")
    parser.add_argument(
        "--refs",
        nargs="+",
        required=True,
        help="List of references to capture (e.g. 'Genesis 1:1-2:3').",
    )
    parser.add_argument(
        "--output",
        default="docs/brain/fixtures",
        help="Directory to store fixture JSON files.",
    )

    args = parser.parse_args()

    asyncio.run(main(args.refs, Path(args.output)))
