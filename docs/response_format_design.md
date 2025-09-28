# Единый JSON-конверт для ответов сервера

## Обзор

Унифицированный формат ответов сервера, который заменяет различные разметки и обеспечивает консистентность для клиентского приложения.

## Структура конверта

```json
{
  "id": "uuid",
  "role": "assistant",
  "mode": "chat|study",
  "display": [
    {
      "type": "text|html|hebrew|image|audio",
      "value": "...",
      "metadata": {
        "lang": "he|ru|en",
        "direction": "rtl|ltr"
      }
    }
  ],
  "source": [
    {
      "ref": "Avot 1:1",
      "version": "source",
      "snippet": "...",
      "commentator": "Rashi",
      "category": "Commentary"
    }
  ],
  "tts": {
    "text": "...",
    "voice": "...",
    "speed": 1.0,
    "emotion": "neutral"
  },
  "thinking": "...",
  "attachments": [
    {
      "kind": "link|doc|note",
      "meta": {},
      "url": "..."
    }
  ],
  "telemetry": {
    "model": "deepseek-chat",
    "provider": "openrouter",
    "params": {
      "temperature": 0.2,
      "top_p": 0.9,
      "top_k": 40,
      "max_tokens": 2000
    },
    "tokens": {
      "input": 150,
      "output": 300,
      "total": 450
    },
    "latency": 2500,
    "cost": 0.0012
  },
  "research": {
    "plan": {},
    "info": {},
    "draft": "..."
  }
}
```

## Типы контента в display

### 1. Обычный текст

```json
{
  "type": "text",
  "value": "Это обычный текстовый ответ",
  "metadata": {
    "lang": "ru",
    "direction": "ltr"
  }
}
```

### 2. HTML контент

```json
{
  "type": "html",
  "value": "<b>Жирный текст</b> и <i>курсив</i>",
  "metadata": {
    "lang": "ru",
    "direction": "ltr"
  }
}
```

### 3. Иврит с RTL

```json
{
  "type": "hebrew",
  "value": "מִשּׁוּם רַבִּי מֵאִיר",
  "metadata": {
    "lang": "he",
    "direction": "rtl",
    "vocalization": "nikkud"
  }
}
```

### 4. Изображение

```json
{
  "type": "image",
  "value": "data:image/png;base64,iVBOR...",
  "metadata": {
    "alt": "Диаграмма исследования",
    "width": 800,
    "height": 600
  }
}
```

### 5. Аудио

```json
{
  "type": "audio",
  "value": "data:audio/wav;base64,UklGR...",
  "metadata": {
    "duration": 5.2,
    "format": "wav"
  }
}
```

## Структура source (первоисточники)

### 1. Текст из Sefaria

```json
{
  "ref": "Avot 1:1",
  "version": "source",
  "snippet": "משה קיבל תורה מסיני ומסרה ליהושע...",
  "lang": "he",
  "book": "Pirkei Avot",
  "chapter": 1,
  "verse": 1
}
```

### 2. Комментарий

```json
{
  "ref": "Rashi on Avot 1:1:1",
  "version": "en",
  "snippet": "Moses received the Torah from Sinai...",
  "commentator": "Rashi",
  "category": "Commentary",
  "lang": "en"
}
```

### 3. Мидраш

```json
{
  "ref": "Avot DeRabbi Natan 1:1",
  "version": "source",
  "snippet": "מעשה ברבי יהושע בן חנניה...",
  "category": "Midrash",
  "lang": "he"
}
```

## TTS настройки

### 1. Базовый TTS

```json
{
  "text": "Текст для озвучивания",
  "voice": "claribel_dervla",
  "speed": 1.0,
  "emotion": "neutral"
}
```

### 2. Многоязычный TTS

```json
{
  "text": "Hello world",
  "voice": "en_speaker",
  "lang": "en",
  "speed": 0.9
}
```

### 3. TTS с SSML

```json
{
  "text": "<speak><emphasis level='strong'>Важно!</emphasis> Это нужно запомнить.</speak>",
  "voice": "ru_speaker",
  "format": "ssml"
}
```

## Thinking контент

### 1. Скрытый thinking

```json
{
  "thinking": "Анализирую запрос пользователя и планирую ответ...",
  "show_thinking": false
}
```

### 2. Показать thinking

```json
{
  "thinking": "Шаг 1: Понять вопрос\nШаг 2: Найти релевантные источники\nШаг 3: Сформировать ответ",
  "show_thinking": true,
  "thinking_collapsed": true
}
```

## Attachments (вложения)

### 1. Ссылка

```json
{
  "kind": "link",
  "meta": {
    "title": "Источник информации",
    "description": "Подробная статья по теме"
  },
  "url": "https://example.com/article"
}
```

### 2. Документ

```json
{
  "kind": "doc",
  "meta": {
    "filename": "research.pdf",
    "size": 2048576,
    "type": "application/pdf"
  },
  "url": "/files/research.pdf"
}
```

### 3. Заметка

```json
{
  "kind": "note",
  "meta": {
    "title": "Важная мысль",
    "tags": ["исследование", "вывод"]
  },
  "content": "Ключевой insight из анализа"
}
```

## Telemetry (телеметрия)

### 1. Базовая телеметрия

```json
{
  "model": "deepseek-chat",
  "provider": "openrouter",
  "params": {
    "temperature": 0.2,
    "top_p": 0.9,
    "max_tokens": 2000
  },
  "tokens": {
    "input": 150,
    "output": 300,
    "total": 450
  },
  "latency": 2500,
  "cost": 0.0012
}
```

### 2. Детальная телеметрия

```json
{
  "model": "gpt-4",
  "provider": "openai",
  "params": {
    "temperature": 0.3,
    "top_p": 0.85,
    "frequency_penalty": 0.6,
    "presence_penalty": 0.1
  },
  "tokens": {
    "input": 250,
    "output": 180,
    "total": 430
  },
  "latency": {
    "total": 3200,
    "llm": 2800,
    "postprocess": 400
  },
  "cost": {
    "input": 0.00075,
    "output": 0.00108,
    "total": 0.00183
  }
}
```

## Research контекст

### 1. Исследовательский план

```json
{
  "research": {
    "plan": {
      "focus": "Анализ источников по этике",
      "guiding_questions": [
        "Что говорят источники об этическом поведении?",
        "Как интерпретируют современные комментаторы?"
      ],
      "outline": [
        "Введение в тему",
        "Анализ первичных источников",
        "Комментарии авторитетов",
        "Современная интерпретация"
      ]
    }
  }
}
```

### 2. Исследовательская информация

```json
{
  "research": {
    "info": {
      "primary_summary": [
        {
          "ref": "Avot 1:1",
          "chunks": 3,
          "truncated": false
        }
      ],
      "commentary_summary": {
        "Rishonim": {
          "count": 5,
          "commentators": ["Rashi", "Rambam", "Tosafot"]
        }
      }
    }
  }
}
```

## Примеры полных ответов

### 1. Обычный чат

```json
{
  "id": "chat-123",
  "role": "assistant",
  "mode": "chat",
  "display": [
    {
      "type": "text",
      "value": "Привет! Чем могу помочь?",
      "metadata": {
        "lang": "ru",
        "direction": "ltr"
      }
    }
  ],
  "telemetry": {
    "model": "deepseek-chat",
    "provider": "openrouter",
    "tokens": {
      "input": 10,
      "output": 8,
      "total": 18
    },
    "latency": 500
  }
}
```

### 2. Study режим с источниками

```json
{
  "id": "study-456",
  "role": "assistant",
  "mode": "study",
  "display": [
    {
      "type": "hebrew",
      "value": "משה קיבל תורה מסיני",
      "metadata": {
        "lang": "he",
        "direction": "rtl"
      }
    },
    {
      "type": "text",
      "value": "Моше получил Тору на Синае",
      "metadata": {
        "lang": "ru",
        "direction": "ltr"
      }
    }
  ],
  "source": [
    {
      "ref": "Avot 1:1",
      "version": "source",
      "snippet": "משה קיבל תורה מסיני ומסרה ליהושע",
      "lang": "he"
    }
  ],
  "tts": {
    "text": "Моше получил Тору на Синае и передал её Йегошуа",
    "voice": "he_speaker",
    "lang": "ru"
  },
  "thinking": "Пользователь спросил о Авот 1:1, нужно показать оригинальный текст и перевод",
  "telemetry": {
    "model": "deepseek-chat",
    "provider": "openrouter",
    "tokens": {
      "input": 25,
      "output": 45,
      "total": 70
    },
    "latency": 1200
  }
}
```

### 3. Исследовательский ответ

```json
{
  "id": "research-789",
  "role": "assistant",
  "mode": "study",
  "display": [
    {
      "type": "html",
      "value": "<h3>Анализ этических принципов</h3><p>На основе изучения источников можно выделить...</p>"
    }
  ],
  "source": [
    {
      "ref": "Avot 1:1",
      "version": "source",
      "snippet": "משה קיבל תורה מסיני ומסרה ליהושע",
      "commentator": "Rashi",
      "category": "Commentary"
    }
  ],
  "research": {
    "plan": {
      "focus": "Этические принципы в иудаизме",
      "guiding_questions": [
        "Как трактуют этику в первичных источниках?",
        "Что говорят комментаторы?"
      ]
    },
    "info": {
      "primary_summary": [
        {
          "ref": "Avot 1:1",
          "chunks": 5,
          "truncated": false
        }
      ],
      "commentary_summary": {
        "Rishonim": {
          "count": 8,
          "commentators": ["Rashi", "Rambam", "Ibn Ezra"]
        }
      }
    }
  },
  "telemetry": {
    "model": "deepseek-chat",
    "provider": "openrouter",
    "tokens": {
      "input": 200,
      "output": 350,
      "total": 550
    },
    "latency": 3500
  }
}
```

## Интеграция с Brain сервисом

### 1. Модификация get_llm_response_stream

```python
def create_unified_response(
    content: str,
    sources: List[Dict] = None,
    tts_text: str = None,
    thinking: str = None,
    research_info: Dict = None,
    telemetry: Dict = None
) -> Dict[str, Any]:
    """Создать унифицированный ответ"""
    response = {
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "mode": "chat",
        "display": [
            {
                "type": "text",
                "value": content,
                "metadata": {
                    "lang": detect_language(content),
                    "direction": "rtl" if is_rtl(content) else "ltr"
                }
            }
        ],
        "telemetry": telemetry or {}
    }

    if sources:
        response["source"] = sources

    if tts_text:
        response["tts"] = {
            "text": tts_text,
            "voice": get_voice_for_language(response["display"][0]["metadata"]["lang"])
        }

    if thinking:
        response["thinking"] = thinking

    if research_info:
        response["research"] = research_info
        response["mode"] = "study"

    return response
```

### 2. Модификация стриминга

```python
async def get_llm_response_stream_unified(
    messages: List[Dict[str, Any]],
    session: Session,
    # ... другие параметры
) -> AsyncGenerator[str, None]:
    """Стриминг с унифицированным форматом"""
    full_content = ""
    sources = []
    thinking_content = ""

    async for chunk in get_llm_response_stream(
        messages, session, use_mem0_tool, mem0_collection,
        use_sefaria_tools, use_research_memory, default_research_collection,
        plan, personality_config
    ):
        full_content += chunk
        yield f"data: {json.dumps({'type': 'content', 'chunk': chunk})}\n\n"

    # После получения полного ответа
    unified_response = create_unified_response(
        content=full_content,
        sources=sources,
        thinking=thinking_content,
        research_info=research_info,
        telemetry=get_telemetry_info()
    )

    yield f"data: {json.dumps({'type': 'complete', 'response': unified_response})}\n\n"
```

### 3. API эндпоинты

```python
@app.post("/chat/unified")
async def chat_unified_handler(request: ChatRequest) -> StreamingResponse:
    """Унифицированный чат с новым форматом"""
    async def generate():
        async for chunk in get_llm_response_stream_unified(
            # ... параметры
        ):
            yield chunk

    return StreamingResponse(generate(), media_type="text/plain")

@app.post("/study/unified")
async def study_unified_handler(request: StudyRequest) -> Dict[str, Any]:
    """Study режим с унифицированным ответом"""
    # ... логика
    return create_unified_response(
        content=response_content,
        sources=sources,
        tts_text=tts_text,
        research_info=research_info
    )
```

## Преимущества формата

1. **Единообразие** - один формат для всех типов ответов
2. **Гибкость** - расширяемая структура
3. **Контекст** - полная информация о происхождении ответа
4. **Мультиязычность** - встроенная поддержка разных языков и направлений
5. **Доступность** - метаданные для TTS и UI
6. **Отладка** - детальная телеметрия
7. **Исследования** - встроенный контекст исследований

## Следующие шаги

1. Реализовать базовые типы контента (text, html, hebrew)
2. Добавить парсинг источников из Sefaria
3. Интегрировать TTS настройки
4. Добавить thinking контент
5. Создать клиентский парсер
6. Тестирование с реальными данными