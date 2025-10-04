"""
Оригинальная реализация конфигурации LLM
Это был отдельный модуль llm_config.py
"""

import os
import json
from typing import Dict, Any, Optional, Tuple
from openai import OpenAI, AsyncOpenAI
import httpx

class LLMConfigError(Exception):
    """Ошибка конфигурации LLM"""
    pass

def get_llm_for_task(task_type: str = "general", model_override: str = None) -> Tuple[AsyncOpenAI, str, Dict[str, Any]]:
    """
    Получение клиента LLM для конкретной задачи

    Args:
        task_type: Тип задачи ("general", "research", "creative", "analytical")
        model_override: Принудительное использование конкретной модели

    Returns:
        Tuple из (client, model_name, config)
    """

    # Определение модели на основе типа задачи
    if model_override:
        model_name = model_override
    else:
        model_name = _get_model_for_task(task_type)

    # Получение конфигурации провайдера
    provider, api_key, base_url = _get_provider_config(model_name)

    # Создание клиента
    client = _create_client(provider, api_key, base_url)

    # Получение параметров модели
    config = _get_model_config(model_name, task_type)

    return client, model_name, config

def _get_model_for_task(task_type: str) -> str:
    """Получение модели для типа задачи"""

    # Модели для различных задач
    task_models = {
        "general": os.getenv("GENERAL_MODEL", "openai/gpt-3.5-turbo"),
        "research": os.getenv("RESEARCH_MODEL", "openai/gpt-4"),
        "creative": os.getenv("CREATIVE_MODEL", "openai/gpt-4"),
        "analytical": os.getenv("ANALYTICAL_MODEL", "openai/gpt-4-turbo"),
        "coding": os.getenv("CODING_MODEL", "openai/gpt-4"),
        "thinker": os.getenv("THINKER_MODEL", "openai/gpt-4"),
        "writer": os.getenv("WRITER_MODEL", "openai/gpt-3.5-turbo")
    }

    return task_models.get(task_type, task_models["general"])

def _get_provider_config(model_name: str) -> Tuple[str, str, Optional[str]]:
    """Получение конфигурации провайдера"""

    # Разбор имени модели для определения провайдера
    if model_name.startswith("openai/"):
        provider = "openai"
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = None
    elif model_name.startswith("openrouter/"):
        provider = "openrouter"
        api_key = os.getenv("OPENROUTER_API_KEY")
        base_url = "https://openrouter.ai/api/v1"
    elif model_name.startswith("ollama/"):
        provider = "ollama"
        api_key = "ollama"  # Не нужен API key для локального Ollama
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    else:
        # По умолчанию OpenAI
        provider = "openai"
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = None

    if not api_key:
        raise LLMConfigError(f"API key not found for provider {provider}")

    return provider, api_key, base_url

def _create_client(provider: str, api_key: str, base_url: Optional[str]) -> AsyncOpenAI:
    """Создание клиента OpenAI"""

    client_kwargs = {
        "api_key": api_key,
    }

    if base_url:
        client_kwargs["base_url"] = base_url

    # Специальные настройки для различных провайдеров
    if provider == "openrouter":
        client_kwargs["default_headers"] = {
            "HTTP-Referer": "https://astra-chat.com",
            "X-Title": "Astra Chat"
        }

    return AsyncOpenAI(**client_kwargs)

def _get_model_config(model_name: str, task_type: str) -> Dict[str, Any]:
    """Получение конфигурации модели"""

    # Базовые параметры
    config = {
        "temperature": float(os.getenv("OPENAI_TEMPERATURE", 0.7)),
        "top_p": float(os.getenv("OPENAI_TOP_P", 0.9)),
        "max_tokens": int(os.getenv("OPENAI_MAX_TOKENS", 2000)),
        "frequency_penalty": float(os.getenv("OPENAI_FREQUENCY_PENALTY", 0.0)),
        "presence_penalty": float(os.getenv("OPENAI_PRESENCE_PENALTY", 0.0)),
    }

    # Специальные настройки для различных типов задач
    task_adjustments = {
        "research": {
            "temperature": 0.3,
            "max_tokens": 3000,
            "frequency_penalty": 0.1
        },
        "creative": {
            "temperature": 0.9,
            "top_p": 0.95,
            "frequency_penalty": 0.0
        },
        "analytical": {
            "temperature": 0.2,
            "max_tokens": 2500,
            "frequency_penalty": 0.2
        },
        "coding": {
            "temperature": 0.1,
            "max_tokens": 4000,
            "frequency_penalty": 0.0
        }
    }

    # Применение настроек для типа задачи
    if task_type in task_adjustments:
        config.update(task_adjustments[task_type])

    # Специальные настройки для конкретных моделей
    model_adjustments = {
        "openai/gpt-4": {"max_tokens": 4000},
        "openai/gpt-4-turbo": {"max_tokens": 4000},
        "openai/gpt-3.5-turbo": {"max_tokens": 4000},
        "ollama/": {"max_tokens": 2000}  # Для всех Ollama моделей
    }

    for model_pattern, adjustments in model_adjustments.items():
        if model_name.startswith(model_pattern):
            config.update(adjustments)
            break

    return config

def get_available_models() -> Dict[str, str]:
    """Получение списка доступных моделей"""

    models = {
        "openai/gpt-3.5-turbo": "OpenAI GPT-3.5 Turbo",
        "openai/gpt-4": "OpenAI GPT-4",
        "openai/gpt-4-turbo": "OpenAI GPT-4 Turbo",
        "openrouter/deepseek-chat": "DeepSeek Chat (OpenRouter)",
        "openrouter/deepseek-coder": "DeepSeek Coder (OpenRouter)",
        "ollama/llama2": "Llama 2 (Ollama)",
        "ollama/codellama": "Code Llama (Ollama)",
        "ollama/mistral": "Mistral (Ollama)"
    }

    return models

def validate_model_config(model_name: str) -> bool:
    """Валидация конфигурации модели"""

    try:
        provider, api_key, base_url = _get_provider_config(model_name)
        return bool(api_key)
    except LLMConfigError:
        return False

# Утилиты для работы с моделями
def get_model_display_name(model_name: str) -> str:
    """Получение отображаемого имени модели"""

    display_names = {
        "openai/gpt-3.5-turbo": "GPT-3.5 Turbo",
        "openai/gpt-4": "GPT-4",
        "openai/gpt-4-turbo": "GPT-4 Turbo",
        "openrouter/deepseek-chat": "DeepSeek Chat",
        "openrouter/deepseek-coder": "DeepSeek Coder",
        "ollama/llama2": "Llama 2",
        "ollama/codellama": "Code Llama",
        "ollama/mistral": "Mistral"
    }

    return display_names.get(model_name, model_name)

def get_provider_for_model(model_name: str) -> str:
    """Получение провайдера для модели"""

    if model_name.startswith("openai/"):
        return "OpenAI"
    elif model_name.startswith("openrouter/"):
        return "OpenRouter"
    elif model_name.startswith("ollama/"):
        return "Ollama"
    else:
        return "Unknown"