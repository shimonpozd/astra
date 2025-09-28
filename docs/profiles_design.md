# Система профилей (Profile JSON)

## Обзор

Система профилей заменяет перегруженный `.env` файл на структурированные JSON-конфигурации, которые можно легко переключать в UI.

## Структура профиля

```json
{
  "name": "local-openrouter",
  "description": "Локальная установка с OpenRouter моделями",
  "llm": {
    "provider": "openrouter",
    "writer_model": "openrouter/deepseek/deepseek-chat",
    "thinker_model": "openrouter/deepseek-chat-v3.1:free",
    "reasoning": "medium",
    "temperature": 0.7,
    "top_p": 0.85,
    "frequency_penalty": 0.6
  },
  "rag": {
    "qdrant_url": "http://localhost:6333",
    "embedding": {
      "provider": "ollama",
      "model": "embeddinggemma:300m",
      "dim": 768
    }
  },
  "voice": {
    "stt": "whisper",
    "tts": "xtts",
    "tts_service_url": "http://localhost:7040"
  },
  "services": {
    "voice-in": true,
    "stt": true,
    "tts": true,
    "memory": true,
    "rag": true
  }
}
```

## Примеры профилей

### 1. Локальный профиль (Ollama + OpenRouter)

```json
{
  "name": "local-ollama",
  "description": "Локальные модели Ollama с OpenRouter для сложных задач",
  "llm": {
    "provider": "ollama",
    "writer_model": "llama3.1:8b",
    "thinker_model": "openrouter/deepseek-chat-v3.1:free",
    "reasoning": "high"
  },
  "rag": {
    "qdrant_url": "http://localhost:6333",
    "embedding": {
      "provider": "ollama",
      "model": "nomic-embed-text",
      "dim": 768
    }
  },
  "voice": {
    "stt": "whisper",
    "tts": "xtts",
    "tts_service_url": "http://localhost:7040"
  }
}
```

### 2. Облачный профиль (OpenAI)

```json
{
  "name": "cloud-openai",
  "description": "OpenAI GPT-4 с расширенными возможностями",
  "llm": {
    "provider": "openai",
    "writer_model": "gpt-4",
    "thinker_model": "gpt-4",
    "reasoning": "medium",
    "temperature": 0.3
  },
  "rag": {
    "qdrant_url": "https://your-qdrant.cloud",
    "embedding": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "dim": 1536
    }
  },
  "voice": {
    "stt": "deepgram",
    "tts": "elevenlabs",
    "tts_service_url": "https://api.elevenlabs.io"
  }
}
```

### 3. Исследовательский профиль

```json
{
  "name": "research-mode",
  "description": "Оптимизировано для глубокого исследования",
  "llm": {
    "provider": "openrouter",
    "writer_model": "openrouter/deepseek/deepseek-chat",
    "thinker_model": "openrouter/deepseek-chat-v3.1:free",
    "reasoning": "high",
    "temperature": 0.2,
    "max_tokens": 4000
  },
  "research": {
    "max_candidates": 50,
    "depth_divisor": 5,
    "draft_max_tokens": 2000
  }
}
```

## Интеграция с Brain сервисом

### 1. Загрузка профиля

```python
# brain/main.py - startup
@app.on_event("startup")
async def startup_event():
    # Загрузка активного профиля
    profile_path = os.getenv("ASTRA_ACTIVE_PROFILE", "profiles/local-openrouter.json")
    if os.path.exists(profile_path):
        with open(profile_path, "r", encoding="utf-8") as f:
            app.state.active_profile = json.load(f)
        logger.info(f"Loaded profile: {app.state.active_profile['name']}")
```

### 2. Применение настроек LLM

```python
def get_llm_for_task(task: str) -> tuple:
    """Получить LLM клиент на основе активного профиля"""
    if not hasattr(app.state, 'active_profile'):
        # Fallback к .env
        return get_llm_from_env(task)

    profile = app.state.active_profile
    llm_config = profile.get("llm", {})

    provider = llm_config.get("provider", "openai")
    model_name = llm_config.get(f"{task.lower()}_model", llm_config.get("writer_model"))

    # Применить параметры из профиля
    reasoning = llm_config.get("reasoning", "medium")
    temperature = llm_config.get("temperature", 0.7)

    return create_client(provider, model_name, reasoning, temperature)
```

### 3. API для управления профилями

```python
@app.get("/profiles")
async def list_profiles():
    """Получить список доступных профилей"""
    profiles_dir = Path("profiles")
    profiles = []

    for profile_file in profiles_dir.glob("*.json"):
        try:
            with open(profile_file, "r", encoding="utf-8") as f:
                profile = json.load(f)
                profiles.append({
                    "name": profile["name"],
                    "description": profile.get("description", ""),
                    "is_active": profile["name"] == app.state.active_profile["name"]
                })
        except Exception as e:
            logger.error(f"Error loading profile {profile_file}: {e}")

    return {"profiles": profiles}

@app.post("/profiles/{profile_name}/activate")
async def activate_profile(profile_name: str):
    """Активировать профиль"""
    profile_path = f"profiles/{profile_name}.json"

    if not os.path.exists(profile_path):
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        with open(profile_path, "r", encoding="utf-8") as f:
            profile = json.load(f)

        app.state.active_profile = profile

        # Сохранить выбор в .env для совместимости
        os.environ["ASTRA_ACTIVE_PROFILE"] = profile_path

        # Перезапустить сервисы с новой конфигурацией
        await restart_services_with_profile(profile)

        return {"status": "ok", "profile": profile["name"]}
    except Exception as e:
        logger.error(f"Error activating profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

## UI интеграция

### 1. Селектор профилей

```typescript
// В верхней панели
<Select
  value={activeProfile}
  onValueChange={handleProfileChange}
  options={profiles.map(p => ({
    value: p.name,
    label: `${p.name} - ${p.description}`
  }))}
/>
```

### 2. Создание/редактирование профилей

```typescript
// Модальное окно для редактирования
const ProfileEditor = () => {
  const [profile, setProfile] = useState({
    name: "",
    description: "",
    llm: {
      provider: "openai",
      writer_model: "",
      thinker_model: "",
      reasoning: "medium"
    },
    // ... другие секции
  });

  return (
    <Dialog>
      <DialogContent>
        <Tabs defaultValue="llm">
          <TabsList>
            <TabsTrigger value="llm">LLM</TabsTrigger>
            <TabsTrigger value="rag">RAG</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
          </TabsList>

          <TabsContent value="llm">
            <LLMConfigForm
              config={profile.llm}
              onChange={(llm) => setProfile({...profile, llm})}
            />
          </TabsContent>
          {/* ... другие табы */}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
```

## Миграция с .env

### 1. Конвертер .env в профили

```python
def convert_env_to_profile(env_path: str = ".env") -> dict:
    """Конвертировать .env в профиль"""
    profile = {
        "name": "migrated-from-env",
        "description": "Мигрировано из .env файла",
        "llm": {
            "provider": os.getenv("ASTRA_LLM_PROVIDER", "openai"),
            "writer_model": os.getenv("ASTRA_MODEL_WRITER", "gpt-3.5-turbo"),
            "thinker_model": os.getenv("ASTRA_MODEL_THINKER", "gpt-4"),
            "reasoning": os.getenv("ASTRA_REASONING", "medium"),
            "temperature": float(os.getenv("OPENAI_TEMPERATURE", "0.7")),
            "top_p": float(os.getenv("OPENAI_TOP_P", "0.85")),
            "frequency_penalty": float(os.getenv("OPENAI_FREQUENCY_PENALTY", "0.6"))
        },
        "rag": {
            "qdrant_url": os.getenv("QDRANT_URL", "http://localhost:6333"),
            "embedding": {
                "provider": os.getenv("EMBEDDING_PROVIDER", "ollama"),
                "model": os.getenv("EMBEDDING_MODEL_NAME", "embeddinggemma:300m"),
                "dim": int(os.getenv("EMBEDDING_DIM", "768"))
            }
        },
        "voice": {
            "stt": os.getenv("ASTRA_STT_PROVIDER", "whisper"),
            "tts": os.getenv("ASTRA_TTS_PROVIDER", "xtts"),
            "tts_service_url": os.getenv("TTS_SERVICE_URL", "http://localhost:7040")
        }
    }

    return profile
```

### 2. Сохранение профиля

```python
def save_profile(profile: dict, filename: str):
    """Сохранить профиль в JSON файл"""
    profiles_dir = Path("profiles")
    profiles_dir.mkdir(exist_ok=True)

    profile_path = profiles_dir / f"{filename}.json"

    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2, ensure_ascii=False)

    logger.info(f"Profile saved to {profile_path}")
```

## Структура директории

```
profiles/
├── local-ollama.json      # Локальные модели
├── cloud-openai.json      # OpenAI в облаке
├── research-mode.json     # Для исследований
├── custom-profile.json    # Пользовательские
└── README.md             # Документация
```

## Преимущества системы

1. **Структурированность** - логическая группировка настроек
2. **Переключаемость** - быстрое переключение между конфигурациями
3. **Совместимость** - fallback к .env для обратной совместимости
4. **Расширяемость** - легко добавлять новые параметры
5. **UI интеграция** - удобное управление через интерфейс
6. **Валидация** - проверка корректности конфигурации

## Следующие шаги

1. Создать базовые профили для распространенных сценариев
2. Добавить валидацию JSON схемы
3. Реализовать импорт/экспорт профилей
4. Добавить CLI команды для управления профилями
5. Интегрировать с launcher.py для выбора профиля при запуске