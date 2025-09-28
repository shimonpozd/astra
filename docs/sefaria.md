# Sefaria Refactoring Plan

This document outlines the agreed-upon architecture for handling Sefaria tool calls to simplify the logic and improve reliability.

## Core Logic

1.  **Remove `open_commentary_by_author_index` Tool:** The complex tool for opening a commentary by author and index will be completely removed.

2.  **Simplify `sefaria_get_links`:** The `sefaria_get_links` tool will be modified. Its new responsibility is to:
    *   Fetch all links from the Sefaria API.
    *   Process the raw links to create a de-duplicated list of unique commentators.
    *   For each unique commentator, it will provide only the very first `ref` as a starting point.
    *   The final output sent to the LLM will be a clean list, for example: `[{"commentator": "Rashi", "ref": "Rashi on Genesis 1:1:1"}, {"commentator": "Rambam", "ref": "Rambam on Genesis 1:1:1"}]`.

3.  **Use `sefaria_get_text_v3` for Opening Commentaries:** To open any commentary, the LLM will now use the standard `sefaria_get_text_v3` tool. It will get the specific `ref` from the clean list provided by the `sefaria_get_links` tool.

4.  **Navigation:** Navigation within a text (e.g., "next"/"previous" segment) will be handled by using the `next` and `prev` fields provided by the API in the response of a `sefaria_get_text_v3` call.

## Implementation Steps

1.  **Refactor `sefaria_utils.py`:** Rewrite the link processing functions to perform de-duplication by commentator, returning one representative `ref` per author.
2.  **Refactor `sefaria_client.py`:** Simplify `sefaria_get_links_async` to use the new util function. Remove the now-unused `open_commentary_by_author_index`.
3.  **Refactor `main.py`:** Remove the `open_commentary_by_author_index` tool definition and its handling logic. Simplify the logic for the `sefaria_get_links` tool call, as it no longer needs to manage caching or complex state for navigating commentaries by index.

---

### Обновление (16.09.2025): Расширение категорий

В систему была добавлена возможность запрашивать не только `Commentary`, но и другие категории ссылок, такие как `Midrash`, `Halakhah` и `Kabbalah`.

**Архитектурные изменения:**

1.  **`sefaria_utils.py`**: Функция `compact_and_deduplicate_links` была модифицирована. Теперь она принимает на вход список строковых категорий (например, `["Midrash", "Halakhah"]`) и фильтрует ссылки в соответствии с этим списком. По умолчанию, если список не передан, используется `["Commentary"]`.

2.  **`sefaria_client.py`**: Функция `sefaria_get_links_async` была обновлена и теперь принимает необязательный строковый параметр `category`. Этот параметр может содержать одну или несколько категорий через запятую (например, `"Midrash,Halakhah"`). Клиент передает их в `compact_and_deduplicate_links` для фильтрации.

3.  **`personalities.json`**: Системный промпт для личности `chevruta_study_bimodal` был обновлен. Теперь он содержит инструкции для LLM, объясняющие, как использовать новый параметр `category` в инструменте `sefaria_get_links`, что позволяет модели динамически запрашивать нужный тип ссылок на основе запроса пользователя.

---

### Обновление (16.09.2025, Вечер): Гибридная логика и сложные тексты

Были внесены два ключевых исправления для повышения надежности работы с API Sefaria.

**1. Восстановлена корректная дедупликация комментаторов**

*   **Проблема:** После добавления поддержки категорий (`Midrash` и др.) логика удаления дубликатов была изменена на фильтрацию по уникальной ссылке (`ref`). Это привело к тому, что один и тот же комментатор (например, Раши) мог появляться в списке несколько раз, если у него было несколько ссылок на один стих.
*   **Решение:** В функцию `compact_and_deduplicate_links` (`sefaria_utils.py`) была возвращена и улучшена **гибридная логика**:
    *   Для категории **`Commentary`** дубликаты удаляются по **имени комментатора**.
    *   Для **всех остальных категорий** (`Midrash`, `Halakhah` и т.д.) дубликаты удаляются по **уникальной ссылке (`ref`)**, что необходимо для текстов без единого автора.

**2. Добавлена обработка "сложных" текстов**

*   **Проблема:** При попытке запросить текст для некоторых Мидрашей (например, `Midrash Tanchuma`) возникала ошибка `400 Bad Request`. Анализ показал, что API Sefaria для "сложных" по структуре текстов требует особого формата `ref`, который отличается от формата, получаемого из эндпоинта `/links`.
*   **Решение:** В функцию `sefaria_get_text_v3_async` (`sefaria_client.py`) добавлена специальная обработка:
    *   Если `ref` начинается с `Midrash Tanchuma`, клиент автоматически преобразует ссылку, добавляя запятую (например, `Midrash Tanchuma Nitzavim 1:1` -> `Midrash Tanchuma, Nitzavim 1:1`).
    *   Это позволяет API корректно распознать и обработать запрос к сложному тексту.
