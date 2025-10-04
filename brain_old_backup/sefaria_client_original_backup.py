"""
Оригинальная реализация клиента Sefaria
Это был отдельный модуль sefaria_client.py
"""

import os
import json
import httpx
from typing import Dict, Any, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

SEFARIA_API_BASE = "https://www.sefaria.org/api"

async def sefaria_get_text_v3_async(
    ref: str,
    version: str = "Sefaria Community Translation",
    context: int = 0,
    strip_html: bool = True
) -> Dict[str, Any]:
    """
    Получение текста из Sefaria API v3

    Args:
        ref: Ссылка на текст (например, "Genesis 1:1")
        version: Версия перевода
        context: Количество строк контекста
        strip_html: Удалить HTML теги

    Returns:
        Словарь с данными текста
    """

    url = f"{SEFARIA_API_BASE}/texts/{ref.replace(' ', '_')}"

    params = {
        "version": version,
        "context": context,
        "strip_html": strip_html
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Error fetching text from Sefaria: {e}")
            return {"error": str(e), "ref": ref}

async def sefaria_get_related_links_async(ref: str) -> List[Dict[str, Any]]:
    """
    Получение связанных ссылок для текста

    Args:
        ref: Ссылка на текст

    Returns:
        Список связанных ссылок
    """

    url = f"{SEFARIA_API_BASE}/links/{ref.replace(' ', '_')}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

            # Фильтрация и обработка ссылок
            links = []
            for item in data:
                if "refs" in item and len(item["refs"]) >= 2:
                    links.append({
                        "source": item["refs"][0],
                        "target": item["refs"][1],
                        "category": item.get("category", "Unknown"),
                        "type": item.get("type", "Unknown")
                    })

            return links[:50]  # Ограничение количества ссылок

        except httpx.HTTPError as e:
            logger.error(f"Error fetching links from Sefaria: {e}")
            return []

async def sefaria_search_async(query: str, size: int = 20) -> List[Dict[str, Any]]:
    """
    Поиск по текстам Sefaria

    Args:
        query: Поисковый запрос
        size: Количество результатов

    Returns:
        Список найденных текстов
    """

    url = f"{SEFARIA_API_BASE}/search"

    params = {
        "q": query,
        "size": size
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("results", []):
                results.append({
                    "ref": item.get("ref", ""),
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "category": item.get("category", "Unknown")
                })

            return results

        except httpx.HTTPError as e:
            logger.error(f"Error searching Sefaria: {e}")
            return []

async def sefaria_get_text_versions_async(ref: str) -> List[Dict[str, Any]]:
    """
    Получение доступных версий текста

    Args:
        ref: Ссылка на текст

    Returns:
        Список доступных версий
    """

    url = f"{SEFARIA_API_BASE}/texts/{ref.replace(' ', '_')}/versions"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

            versions = []
            for version in data.get("versions", []):
                versions.append({
                    "title": version.get("versionTitle", ""),
                    "language": version.get("language", ""),
                    "source": version.get("versionSource", "")
                })

            return versions

        except httpx.HTTPError as e:
            logger.error(f"Error fetching versions from Sefaria: {e}")
            return []

def parse_sefaria_ref(ref: str) -> Tuple[str, str, str]:
    """
    Разбор ссылки Sefaria

    Args:
        ref: Ссылка в формате "Book Chapter:Verse"

    Returns:
        Кортеж (book, chapter, verse)
    """

    parts = ref.split()
    if len(parts) < 2:
        return ref, "", ""

    book = parts[0]
    chapter_verse = parts[1]

    if ":" in chapter_verse:
        chapter, verse = chapter_verse.split(":", 1)
        return book, chapter, verse
    else:
        return book, chapter_verse, ""

def format_sefaria_ref(book: str, chapter: str, verse: str = "") -> str:
    """
    Форматирование ссылки Sefaria

    Args:
        book: Название книги
        chapter: Глава
        verse: Стих (опционально)

    Returns:
        Отформатированная ссылка
    """

    if verse:
        return f"{book} {chapter}:{verse}"
    else:
        return f"{book} {chapter}"

def get_sefaria_category(ref: str) -> str:
    """
    Определение категории текста Sefaria

    Args:
        ref: Ссылка на текст

    Returns:
        Категория (Torah, Prophets, Writings, Talmud, etc.)
    """

    book = ref.split()[0].lower()

    # Torah
    if book in ["genesis", "exodus", "leviticus", "numbers", "deuteronomy"]:
        return "Torah"

    # Prophets
    if book in ["joshua", "judges", "samuel", "kings", "isaiah", "jeremiah", "ezekiel"]:
        return "Prophets"

    # Writings
    if book in ["psalms", "proverbs", "job", "song", "ruth", "lamentations", "ecclesiastes", "esther"]:
        return "Writings"

    # Talmud
    if "shabbat" in book or "berakhot" in book or "pesachim" in book:
        return "Talmud"

    # Mishnah
    if book in ["mishnah", "zeraim", "moed", "nashim", "nezikin", "kodashim", "taharot"]:
        return "Mishnah"

    return "Other"

# Кеширование для производительности
_text_cache = {}
_links_cache = {}

async def sefaria_get_text_cached(ref: str, version: str = "Sefaria Community Translation") -> Dict[str, Any]:
    """
    Получение текста с кешированием
    """

    cache_key = f"{ref}:{version}"

    if cache_key in _text_cache:
        return _text_cache[cache_key]

    result = await sefaria_get_text_v3_async(ref, version)

    if "error" not in result:
        _text_cache[cache_key] = result

        # Ограничение размера кеша
        if len(_text_cache) > 1000:
            # Очистка старых записей
            oldest_keys = sorted(_text_cache.keys())[:100]
            for key in oldest_keys:
                del _text_cache[key]

    return result

async def sefaria_get_links_cached(ref: str) -> List[Dict[str, Any]]:
    """
    Получение ссылок с кешированием
    """

    if ref in _links_cache:
        return _links_cache[ref]

    result = await sefaria_get_related_links_async(ref)

    if result:
        _links_cache[ref] = result

        # Ограничение размера кеша
        if len(_links_cache) > 500:
            oldest_keys = sorted(_links_cache.keys())[:50]
            for key in oldest_keys:
                del _links_cache[key]

    return result