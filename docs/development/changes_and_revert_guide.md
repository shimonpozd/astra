# Руководство по изменениям и откату (Changes and Revert Guide)

Этот документ описывает все изменения, внесенные в проект в ходе работы над функцией "Расширенный лексикон" и связанных с ней исправлений.

**Важное примечание:** Для отката изменений настоятельно рекомендуется использовать систему контроля версий (например, Git). Ручной откат может быть сложным и привести к новым ошибкам.

## 1. Внедрение функции "Расширенный лексикон"

### 1.1. Установка зависимостей
- **Файл:** `astra-web-client/package.json`
- **Изменение:** Добавлена библиотека `zustand`.
- **Откат:** В директории `astra-web-client` выполните `npm uninstall zustand`.

### 1.2. Создание хранилища состояния лексикона
- **Файл:** `astra-web-client/src/store/lexiconStore.ts`
- **Изменение:** Создан новый файл для управления состоянием лексикона.
- **Откат:** Удалите файл `astra-web-client/src/store/lexiconStore.ts`.

### 1.3. Создание хука для отслеживания выделения текста
- **Файл:** `astra-web-client/src/hooks/useTextSelectionListener.ts`
- **Изменение:** Создан новый файл с хуком для обработки событий `mouseup` и `keydown` (Enter).
- **Откат:** Удалите файл `astra-web-client/src/hooks/useTextSelectionListener.ts`.

### 1.4. Создание компонента панели лексикона
- **Файл:** `astra-web-client/src/components/LexiconPanel.tsx`
- **Изменение:** Создан новый компонент для отображения результатов лексикона.
- **Откат:** Удалите файл `astra-web-client/src/components/LexiconPanel.tsx`.

### 1.5. Интеграция лексикона в основное приложение
- **Файл:** `astra-web-client/src/App.tsx`
- **Изменение:** Добавлены импорты `useTextSelectionListener` и `LexiconPanel`. Вызовы `useTextSelectionListener()` и `<LexiconPanel />` добавлены в компонент `App`.
- **Откат:** Удалите соответствующие строки импорта и вызова компонентов из `App.tsx`.

### 1.6. Настройка прокси для бэкенда
- **Файл:** `astra-web-client/vite.config.ts`
- **Изменение:** Добавлено правило прокси для пути `/actions`, перенаправляющее запросы на бэкенд.
- **Откат:** Удалите блок прокси для `/actions` из `vite.config.ts`.

### 1.7. Исправление логики обновления выделения в лексиконе
- **Файл:** `astra-web-client/src/store/lexiconStore.ts`
- **Изменение:** Удалено условие `if (!get().isPanelOpen)` из функции `setSelection`, чтобы выделение всегда обновлялось.
- **Откат:** Верните условие `if (!get().isPanelOpen)` в функцию `setSelection`.

## 2. Исправление навигации в админ-панели

### 2.1. Вынесение TopBar в отдельный компонент
- **Файл:** `astra-web-client/src/components/layout/TopBar.tsx`
- **Изменение:** Создан новый файл, содержащий компонент `TopBar` (вынесен из `ChatLayout.tsx`).
- **Откат:** Удалите файл `astra-web-client/src/components/layout/TopBar.tsx`.

### 2.2. Обновление ChatLayout для использования нового TopBar
- **Файл:** `astra-web-client/src/components/chat/ChatLayout.tsx`
- **Изменение:** Удалено встроенное определение `TopBar`, добавлен импорт и использование нового компонента `TopBar`. Восстановлен `useNavigate` и состояния `studyMessages`, `studyIsSending`.
- **Откат:** Восстановите оригинальное содержимое `ChatLayout.tsx` (до вынесения `TopBar`).

### 2.3. Интеграция TopBar в AdminLayout
- **Файл:** `astra-web-client/src/pages/AdminLayout.tsx`
- **Изменение:** Добавлен импорт и использование компонента `TopBar`, а также состояния `agentId`.
- **Откат:** Восстановите оригинальное содержимое `AdminLayout.tsx`.

## 3. Исправление сохранения промптов и конфигурации

### 3.1. Исправление логики слияния промптов
- **Файл:** `config/prompts.py`
- **Изменение:** Исправлена функция `_deep_merge_dict` и ее вызов в `_load_all_prompts` для корректного слияния переопределений поверх значений по умолчанию.
- **Откат:** Верните `_deep_merge_dict` и вызов в `_load_all_prompts` к исходному (ошибочному) состоянию.

### 3.2. Исправление логики слияния общей конфигурации
- **Файл:** `config/__init__.py`
- **Изменение:** Исправлена функция `_deep_merge_dict` и ее вызовы в `get_config` и `update_config` для корректного слияния настроек.
- **Откат:** Верните `_deep_merge_dict` и вызовы в `get_config`, `update_config` к исходному (ошибочному) состоянию.

### 3.3. Исправление отправки данных конфигурации фронтендом
- **Файл:** `astra-web-client/src/pages/admin/GeneralSettings.tsx`
- **Изменение:** Удален вызов `flattenObject` перед отправкой данных конфигурации на бэкенд, чтобы отправлялась вложенная структура.
- **Откат:** Верните вызов `flattenObject` в `saveConfig`.

## 4. Улучшение и отладка функции перевода

### 4.1. Рефакторинг промпта переводчика (две части)
- **Файл:** `brain/main.py`
- **Изменение:** Изменен `translate_handler` для использования двух отдельных промптов (`actions.translator_system` и `actions.translator_user_template`). Добавлена агрессивная очистка от '```' и 'think' тегов.
- **Откат:** Восстановите `translate_handler` к исходному состоянию (использование одного промпта и конкатенация строк). Удалите логирование `TRANSLATE_STREAM`.

### 4.2. Определение нового промпта для переводчика
- **Файл:** `config/defaults.toml`
- **Изменение:** Добавлен новый промпт `actions.translator_user_template` и скорректирован `actions.translator_system`.
- **Откат:** Удалите `actions.translator_user_template` и верните `actions.translator_system` к исходному тексту.

### 4.3. Исправление обработки потока перевода на фронтенде
- **Файл:** `astra-web-client/src/services/api.ts`
- **Изменение:** Переписана функция `translateText` для корректной обработки NDJSON-потока от бэкенда.
- **Откат:** Верните `translateText` к исходному состоянию (вызов `response.json()`).

### 4.4. Исправление парсинга JSON в хуке useTranslation
- **Файл:** `astra-web-client/src/hooks/useTranslation.ts`
- **Изменение:** Модифицирован хук для парсинга JSON-ответа от LLM и извлечения ключа `translation`. Удалены отладочные логи.
- **Откат:** Верните `useTranslation` к исходному состоянию (до парсинга JSON и отладочных логов).

### 4.5. Исправление получения текстов из Sefaria (backend)
- **Файл:** `brain/study_utils.py`
- **Изменение:** Модифицирован `get_text_with_window` для **всегда** получения обоих языков из Sefaria и более надежного заполнения `focus_data`. Добавлена функция `containsHebrew`.
- **Откат:** Удалите `containsHebrew` и верните `get_text_with_window` к исходному состоянию.

### 4.6. Исправление строгости языка в Sefaria API (backend)
- **Файл:** `brain/sefaria_client.py`
- **Изменение:** Модифицирован `sefaria_get_text_v3_async` для строгого соблюдения запрошенного языка и использования параметра `version`. Исправлена ошибка сравнения языка.
- **Откат:** Верните `sefaria_get_text_v3_async` к исходному состоянию.

### 4.7. Исправление отображения текста в FocusReader
- **Файл:** `astra-web-client/src/components/study/FocusReader.tsx`
- **Изменение:** Изменена логика отображения текста в `TextSegmentComponent` для приоритета иврита и корректного размера шрифта.
- **Откат:** Верните `FocusReader.tsx` к исходному состоянию.

## 5. Отладочные изменения (можно удалить)

### 5.1. Мигающая точка
- **Файл:** `astra-web-client/src/components/BlinkingDot.tsx`
- **Изменение:** Создан компонент для проверки блокировки UI.
- **Откат:** Удалите файл `astra-web-client/src/components/BlinkingDot.tsx`.

### 5.2. Интеграция мигающей точки
- **Файл:** `astra-web-client/src/App.tsx`
- **Изменение:** Добавлен импорт и использование `BlinkingDot`.
- **Откат:** Удалите соответствующие строки импорта и вызова компонента из `App.tsx`.

### 5.3. Логирование в main.py
- **Файл:** `brain/main.py`
- **Изменение:** Добавлено временное логирование для отладки.
- **Откат:** Удалите все строки `logger.info` и `logger.warning` с префиксами `LEXICON_STREAM`, `TRANSLATE_STREAM`, `TRANSLATE_HANDLER`, `LEXICON_HANDLER`.

### 5.4. Логирование в study_utils.py
- **Файл:** `brain/study_utils.py`
- **Изменение:** Добавлено временное логирование для отладки.
- **Откат:** Удалите все строки `logger.info` и `logger.warning` с префиксом `GET_TEXT_WINDOW`.

### 5.5. Логирование в sefaria_client.py
- **Файл:** `brain/sefaria_client.py`
- **Изменение:** Добавлено временное логирование для отладки.
- **Откат:** Удалите все строки `logger.info` и `logger.warning` с префиксом `SEFARIA_CLIENT`.
