"""
Оригинальная реализация управления сессиями через Redis
Это был отдельный модуль для работы с Redis сессиями
"""

import json
import redis.asyncio as redis
from typing import Dict, Any, Optional
from datetime import datetime

class RedisSessionManager:
    """Управление сессиями через Redis"""

    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        self.redis_url = redis_url
        self.redis_client: Optional[redis.Redis] = None

    async def connect(self):
        """Подключение к Redis"""
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            await self.redis_client.ping()
            return True
        except Exception as e:
            print(f"Failed to connect to Redis: {e}")
            return False

    async def get_session(self, session_id: str, user_id: str, agent_id: str) -> Dict[str, Any]:
        """Получение сессии из Redis"""
        if not self.redis_client:
            return self._create_empty_session(session_id, user_id, agent_id)

        try:
            session_key = f"session:{session_id}"
            session_data = await self.redis_client.get(session_key)

            if session_data:
                return json.loads(session_data)
            else:
                return self._create_empty_session(session_id, user_id, agent_id)

        except Exception as e:
            print(f"Error getting session: {e}")
            return self._create_empty_session(session_id, user_id, agent_id)

    async def save_session(self, session_id: str, session_data: Dict[str, Any]):
        """Сохранение сессии в Redis"""
        if not self.redis_client:
            return

        try:
            session_key = f"session:{session_id}"
            session_data["last_modified"] = datetime.now().isoformat()
            await self.redis_client.set(session_key, json.dumps(session_data))
        except Exception as e:
            print(f"Error saving session: {e}")

    async def get_all_sessions(self) -> Dict[str, Dict[str, Any]]:
        """Получение всех сессий"""
        if not self.redis_client:
            return {}

        try:
            keys = await self.redis_client.keys("session:*")
            sessions = {}

            for key in keys:
                session_data = await self.redis_client.get(key)
                if session_data:
                    session_id = key.decode().replace("session:", "")
                    sessions[session_id] = json.loads(session_data)

            return sessions
        except Exception as e:
            print(f"Error getting all sessions: {e}")
            return {}

    def _create_empty_session(self, session_id: str, user_id: str, agent_id: str) -> Dict[str, Any]:
        """Создание пустой сессии"""
        return {
            "session_id": session_id,
            "user_id": user_id,
            "agent_id": agent_id,
            "created_at": datetime.now().isoformat(),
            "last_modified": datetime.now().isoformat(),
            "short_term_memory": [],
            "last_research_plan": None,
            "last_research_collection": None,
            "last_sefaria_links": []
        }

# Глобальный экземпляр менеджера сессий
session_manager = RedisSessionManager()

async def init_session_manager():
    """Инициализация менеджера сессий"""
    await session_manager.connect()

async def get_session(session_id: str, user_id: str, agent_id: str) -> Dict[str, Any]:
    """Получение сессии (для обратной совместимости)"""
    return await session_manager.get_session(session_id, user_id, agent_id)

async def save_session(session_id: str, session_data: Dict[str, Any]):
    """Сохранение сессии (для обратной совместимости)"""
    await session_manager.save_session(session_id, session_data)

async def get_all_sessions():
    """Получение всех сессий (для обратной совместимости)"""
    return await session_manager.get_all_sessions()