"""
Оригинальная реализация управления состоянием
Это был отдельный модуль state.py
"""

import redis.asyncio as redis
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class Message:
    """Класс для представления сообщения в чате"""
    role: str  # "user", "assistant", "system"
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def model_dump(self) -> Dict[str, Any]:
        """Сериализация для передачи в API"""
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata
        }

@dataclass
class Session:
    """Класс для управления сессией чата"""
    user_id: str
    agent_id: str
    persistent_session_id: str
    short_term_memory: list[Message] = field(default_factory=list)
    long_term_memory: list[Message] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)
    last_research_plan: Optional[Dict[str, Any]] = None
    last_research_collection: Optional[str] = None
    last_sefaria_links: list[str] = field(default_factory=list)

    def add_message(self, role: str, content: str, metadata: Dict[str, Any] = None):
        """Добавление сообщения в сессию"""
        message = Message(
            role=role,
            content=content,
            metadata=metadata or {}
        )
        self.short_term_memory.append(message)
        self.last_activity = datetime.now()

        # Ограничение размера кратковременной памяти
        if len(self.short_term_memory) > 100:
            self.short_term_memory = self.short_term_memory[-50:]

    def get_recent_messages(self, limit: int = 20) -> list[Message]:
        """Получение последних сообщений"""
        return self.short_term_memory[-limit:] if self.short_term_memory else []

    def clear_memory(self):
        """Очистка памяти сессии"""
        self.short_term_memory.clear()
        self.long_term_memory.clear()
        self.last_research_plan = None
        self.last_research_collection = None
        self.last_sefaria_links.clear()

class GlobalState:
    """Глобальное состояние приложения"""

    def __init__(self):
        self.sessions: Dict[tuple, Session] = {}
        self.personalities: Dict[str, Dict[str, Any]] = {}
        self.redis_client: Optional[redis.Redis] = None
        self.metrics = {
            "total_sessions": 0,
            "active_sessions": 0,
            "total_messages": 0,
            "research_sessions": 0
        }

    def get_or_create_session(self, user_id: str, agent_id: str, session_id: str) -> Session:
        """Получение или создание сессии"""
        session_key = (user_id, agent_id)

        if session_key not in self.sessions:
            self.sessions[session_key] = Session(
                user_id=user_id,
                agent_id=agent_id,
                persistent_session_id=session_id
            )
            self.metrics["total_sessions"] += 1
            self.metrics["active_sessions"] += 1

        return self.sessions[session_key]

    def remove_session(self, user_id: str, agent_id: str):
        """Удаление сессии"""
        session_key = (user_id, agent_id)
        if session_key in self.sessions:
            del self.sessions[session_key]
            self.metrics["active_sessions"] -= 1

    def get_session_count(self) -> int:
        """Получение количества активных сессий"""
        return len(self.sessions)

    def update_metrics(self):
        """Обновление метрик"""
        self.metrics["active_sessions"] = len(self.sessions)
        self.metrics["total_messages"] = sum(
            len(session.short_term_memory) for session in self.sessions.values()
        )

# Глобальный экземпляр состояния
state = GlobalState()

# Функции для обратной совместимости
async def get_session_from_redis(session_id: str, user_id: str, agent_id: str) -> Session:
    """Получение сессии из глобального состояния"""
    return state.get_or_create_session(user_id, agent_id, session_id)

async def save_session_to_redis(session: Session):
    """Сохранение сессии в Redis (заглушка)"""
    if state.redis_client:
        try:
            session_data = {
                "user_id": session.user_id,
                "agent_id": session.agent_id,
                "persistent_session_id": session.persistent_session_id,
                "short_term_memory": [msg.model_dump() for msg in session.short_term_memory],
                "long_term_memory": [msg.model_dump() for msg in session.long_term_memory],
                "created_at": session.created_at.isoformat(),
                "last_activity": session.last_activity.isoformat(),
                "last_research_plan": session.last_research_plan,
                "last_research_collection": session.last_research_collection,
                "last_sefaria_links": session.last_sefaria_links,
                "last_modified": datetime.now().isoformat()
            }

            session_key = f"session:{session.persistent_session_id}"
            await state.redis_client.set(session_key, json.dumps(session_data))
        except Exception as e:
            print(f"Error saving session to Redis: {e}")

def get_personality_config(agent_id: str) -> Dict[str, Any]:
    """Получение конфигурации персонажа"""
    return state.personalities.get(agent_id, {})

def load_personalities_from_file(file_path: str):
    """Загрузка персонажей из файла"""
    import json
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            state.personalities = json.load(f)
    except Exception as e:
        print(f"Error loading personalities: {e}")
        state.personalities = {}