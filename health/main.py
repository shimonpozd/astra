
import asyncio
import logging_utils
import time

import psutil
import requests
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

# --- Конфигурация ---
logger = logging_utils.get_logger("health.main", service="health")

# Список сервисов для проверки
# Ключ: имя сервиса, Значение: URL для проверки состояния
SERVICES_TO_CHECK = {
    "voice-in": "http://localhost:7010/status",
    "stt": "http://localhost:7020/health",
    "brain": "http://localhost:7030/health",
    "memory": "http://localhost:7050/health",
    "rag": "http://localhost:7060/health",
    "tts_xtts": "http://localhost:8020/healthz",  # У XTTS-сервера эндпоинт /healthz
    "qdrant": "http://localhost:6333/",  # Qdrant отвечает на корневой URL
}

REQUEST_TIMEOUT = 2.0  # 2 секунды на проверку каждого сервиса

# --- Модели данных ---
class ServiceStatus(BaseModel):
    status: str  # OK | ERROR
    details: dict | str
    response_time_ms: int

class SystemMetrics(BaseModel):
    cpu_percent: float
    memory_percent: float

class HealthReport(BaseModel):
    overall_status: str
    system: SystemMetrics
    services: dict[str, ServiceStatus]

# --- FastAPI приложение ---
app = FastAPI(
    title="Health Service",
    description="Мониторит состояние всех сервисов в экосистеме ассистента.",
    version="1.0.0"
)

def check_service(url: str) -> tuple[str, dict | str, int]:
    """Выполняет синхронный запрос для проверки одного сервиса."""
    start_time = time.time()
    try:
        response = requests.get(url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()  # Вызовет исключение для 4xx/5xx ответов
        status = "OK"
        details = response.json()
    except requests.RequestException as e:
        status = "ERROR"
        details = str(e)
    except Exception as e:
        status = "ERROR"
        details = f"An unexpected error occurred: {str(e)}"
    
    end_time = time.time()
    response_time_ms = int((end_time - start_time) * 1000)
    return status, details, response_time_ms

@app.get("/", response_model=HealthReport)
async def get_health_report():
    """Собирает и возвращает отчет о состоянии всех систем."""
    
    # Асинхронно запускаем проверки для всех сервисов
    loop = asyncio.get_event_loop()
    tasks = {
        name: loop.run_in_executor(None, check_service, url)
        for name, url in SERVICES_TO_CHECK.items()
    }
    
    results = await asyncio.gather(*tasks.values())
    
    service_statuses = {}
    overall_ok = True
    for (name, (status, details, response_time_ms)) in zip(tasks.keys(), results):
        service_statuses[name] = ServiceStatus(
            status=status,
            details=details,
            response_time_ms=response_time_ms
        )
        if status == "ERROR":
            overall_ok = False

    # Сбор системных метрик
    system_metrics = SystemMetrics(
        cpu_percent=psutil.cpu_percent(),
        memory_percent=psutil.virtual_memory().percent
    )

    return HealthReport(
        overall_status="OK" if overall_ok else "DEGRADED",
        system=system_metrics,
        services=service_statuses
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7099)
