from fastapi import Request, HTTPException, Header
import redis.asyncio as redis

def get_redis_client(request: Request) -> redis.Redis:
    """Dependency to get the Redis client from the application state."""
    if not hasattr(request.app.state, 'redis_client') or request.app.state.redis_client is None:
        raise HTTPException(status_code=503, detail="Redis client is not available.")
    return request.app.state.redis_client

def get_http_client(request: Request):
    """Dependency to get the HTTPX client from the application state."""
    return request.app.state.http_client

def get_sefaria_service(request: Request):
    """Dependency to get the SefariaService instance."""
    return request.app.state.sefaria_service

def get_sefaria_index_service(request: Request):
    """Dependency to get the SefariaIndexService instance."""
    return request.app.state.sefaria_index_service

def get_tool_registry(request: Request):
    """Dependency to get the ToolRegistry instance."""
    return request.app.state.tool_registry

def get_memory_service(request: Request):
    """Dependency to get the MemoryService instance."""
    return request.app.state.memory_service

def get_chat_service(request: Request):
    """Dependency to get the ChatService instance."""
    return request.app.state.chat_service

def get_study_service(request: Request):
    """Dependency to get the StudyService instance."""
    return request.app.state.study_service

def get_config_service(request: Request):
    """Dependency to get the ConfigService instance."""
    return request.app.state.config_service

def get_lexicon_service(request: Request):
    """Dependency to get the LexiconService instance."""
    return request.app.state.lexicon_service

def get_session_service(request: Request):
    """Dependency to get the SessionService instance."""
    return request.app.state.session_service

def get_translation_service(request: Request):
    """Dependency to get the TranslationService instance."""
    return request.app.state.translation_service

def get_navigation_service(request: Request):
    """Dependency to get the NavigationService instance."""
    return request.app.state.navigation_service


def require_admin_token(x_admin_token: str = Header(None)):
    """Dependency to require admin token for protected endpoints."""
    if x_admin_token != "super-secret-token":
        raise HTTPException(status_code=401, detail="Invalid admin token")
    return x_admin_token
