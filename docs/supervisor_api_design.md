# Supervisor API для управления сервисами

## Обзор

Легкий HTTP API для управления сервисами системы Astra, который позволяет перезапускать, останавливать и мониторить сервисы без необходимости перезапуска всей системы.

## Архитектура

### 1. Supervisor Service

Новый микросервис, который:
- Управляет процессами сервисов
- Предоставляет HTTP API для контроля
- Мониторит состояние сервисов
- Собирает логи и метрики

### 2. Интеграция с существующими сервисами

- Brain сервис: добавляет эндпоинты для supervisor
- Launcher: использует API для управления
- Web UI: кнопки restart/stop через API

## API Спецификация

### Base URL
```
http://localhost:7031/supervisor
```

### Endpoints

#### 1. GET /status
Получить статус всех сервисов

```json
{
  "services": {
    "brain": {
      "status": "running",
      "pid": 12345,
      "uptime": 3600,
      "port": 7030,
      "cpu_percent": 2.5,
      "memory_mb": 156.7,
      "last_restart": "2024-01-20T10:30:00Z",
      "restart_count": 2
    },
    "tts": {
      "status": "stopped",
      "pid": null,
      "uptime": 0,
      "port": 7040,
      "cpu_percent": 0,
      "memory_mb": 0,
      "last_restart": null,
      "restart_count": 0
    }
  },
  "system": {
    "total_services": 7,
    "running_services": 5,
    "total_memory_mb": 234.5,
    "total_cpu_percent": 8.2
  }
}
```

#### 2. POST /restart
Перезапустить сервис

**Request:**
```json
{
  "name": "brain"
}
```

**Response:**
```json
{
  "status": "restarting",
  "service": "brain",
  "message": "Service brain is being restarted"
}
```

#### 3. POST /stop
Остановить сервис

**Request:**
```json
{
  "name": "tts"
}
```

**Response:**
```json
{
  "status": "stopping",
  "service": "tts",
  "message": "Service tts is being stopped"
}
```

#### 4. POST /start
Запустить сервис

**Request:**
```json
{
  "name": "memory",
  "config": {
    "env": {
      "MEMORY_MASK_PII": "false"
    }
  }
}
```

**Response:**
```json
{
  "status": "starting",
  "service": "memory",
  "message": "Service memory is being started"
}
```

#### 5. GET /logs/{service}
Получить логи сервиса

**Query Parameters:**
- `lines` (int, optional): количество строк (default: 100)
- `follow` (bool, optional): следовать за логом в реальном времени

**Response:**
```json
{
  "service": "brain",
  "logs": [
    "[2024-01-20 10:30:15] INFO: Starting brain service",
    "[2024-01-20 10:30:16] INFO: Connected to Redis",
    "[2024-01-20 10:30:17] INFO: Ready to accept connections"
  ],
  "total_lines": 15432
}
```

#### 6. POST /reload
Перезагрузить конфигурацию сервиса

**Request:**
```json
{
  "name": "brain",
  "type": "config|code"
}
```

**Response:**
```json
{
  "status": "reloading",
  "service": "brain",
  "message": "Service brain configuration is being reloaded"
}
```

#### 7. GET /health/{service}
Проверить здоровье сервиса

**Response:**
```json
{
  "service": "brain",
  "status": "healthy",
  "checks": {
    "http_endpoint": "ok",
    "database": "ok",
    "external_apis": "ok"
  },
  "response_time": 45
}
```

#### 8. POST /bulk
Групповые операции

**Request:**
```json
{
  "action": "restart",
  "services": ["brain", "memory", "rag"],
  "parallel": true
}
```

**Response:**
```json
{
  "status": "processing",
  "operations": [
    {
      "service": "brain",
      "status": "restarting"
    },
    {
      "service": "memory",
      "status": "restarting"
    }
  ]
}
```

## Реализация Supervisor Service

### 1. Основной сервис

```python
# supervisor/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncio
import psutil
import json
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

app = FastAPI(title="Astra Supervisor", version="1.0.0")

class ServiceConfig(BaseModel):
    name: str
    cmd: List[str]
    cwd: str = "."
    env: Dict[str, str] = {}
    optional: bool = False

class RestartRequest(BaseModel):
    name: str
    config: Optional[Dict] = None

# Глобальное состояние
services: Dict[str, Dict] = {}
service_processes: Dict[str, asyncio.subprocess.Process] = {}

@app.on_event("startup")
async def startup_event():
    """Загрузить конфигурацию сервисов"""
    config_path = Path("astra_services.json")
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            services.update(json.load(f))

@app.get("/status")
async def get_status():
    """Получить статус всех сервисов"""
    # ... реализация
    pass

@app.post("/restart")
async def restart_service(request: RestartRequest):
    """Перезапустить сервис"""
    # ... реализация
    pass

# ... другие эндпоинты
```

### 2. Управление процессами

```python
class ProcessManager:
    def __init__(self):
        self.processes: Dict[str, asyncio.subprocess.Process] = {}
        self.process_info: Dict[str, Dict] = {}

    async def start_service(self, name: str, config: ServiceConfig) -> bool:
        """Запустить сервис"""
        try:
            # Создать окружение
            env = os.environ.copy()
            env.update(config.env)

            # Запустить процесс
            process = await asyncio.create_subprocess_exec(
                *config.cmd,
                cwd=config.cwd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )

            self.processes[name] = process
            self.process_info[name] = {
                "pid": process.pid,
                "started_at": datetime.now(),
                "restart_count": 0
            }

            # Запустить мониторинг
            asyncio.create_task(self._monitor_process(name, process))

            return True
        except Exception as e:
            logger.error(f"Failed to start service {name}: {e}")
            return False

    async def stop_service(self, name: str) -> bool:
        """Остановить сервис"""
        if name not in self.processes:
            return False

        process = self.processes[name]
        try:
            process.terminate()
            await asyncio.wait_for(process.wait(), timeout=10.0)

            # Force kill if still running
            if process.returncode is None:
                process.kill()
                await process.wait()

            return True
        except Exception as e:
            logger.error(f"Failed to stop service {name}: {e}")
            return False
        finally:
            self.processes.pop(name, None)
            self.process_info.pop(name, None)

    async def restart_service(self, name: str, config: ServiceConfig) -> bool:
        """Перезапустить сервис"""
        await self.stop_service(name)

        # Подождать перед перезапуском
        await asyncio.sleep(2)

        # Увеличить счетчик перезапусков
        if name in self.process_info:
            self.process_info[name]["restart_count"] += 1

        return await self.start_service(name, config)

    async def _monitor_process(self, name: str, process: asyncio.subprocess.Process):
        """Мониторить процесс"""
        try:
            while process.returncode is None:
                await asyncio.sleep(1)

                # Проверить статус процесса
                if process.returncode is not None:
                    logger.warning(f"Service {name} exited with code {process.returncode}")
                    break

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error monitoring service {name}: {e}")

    def get_service_status(self, name: str) -> Dict:
        """Получить статус сервиса"""
        if name not in self.processes:
            return {"status": "stopped"}

        process = self.processes[name]
        info = self.process_info.get(name, {})

        if process.returncode is None:
            # Процесс запущен
            try:
                ps_process = psutil.Process(process.pid)
                return {
                    "status": "running",
                    "pid": process.pid,
                    "uptime": (datetime.now() - info.get("started_at", datetime.now())).seconds,
                    "cpu_percent": ps_process.cpu_percent(),
                    "memory_mb": ps_process.memory_info().rss / 1024 / 1024,
                    "restart_count": info.get("restart_count", 0)
                }
            except psutil.NoSuchProcess:
                return {"status": "crashed"}
        else:
            return {
                "status": "exited",
                "exit_code": process.returncode,
                "restart_count": info.get("restart_count", 0)
            }
```

### 3. Интеграция с Brain сервисом

```python
# brain/main.py - добавляем эндпоинты supervisor
@app.get("/supervisor/status")
async def supervisor_status():
    """Прокси к supervisor API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:7031/supervisor/status")
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Supervisor unavailable: {e}")

@app.post("/supervisor/restart")
async def supervisor_restart(request: Dict[str, str]):
    """Прокси для перезапуска сервиса"""
    service_name = request.get("name")
    if not service_name:
        raise HTTPException(status_code=400, detail="Service name required")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:7031/supervisor/restart",
                json={"name": service_name}
            )
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Supervisor unavailable: {e}")
```

## UI интеграция

### 1. Панель сервисов в Web UI

```typescript
// components/ServicePanel.tsx
const ServicePanel = () => {
  const [services, setServices] = useState({});
  const [loading, setLoading] = useState({});

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/supervisor/status');
      const data = await response.json();
      setServices(data.services);
    } catch (error) {
      console.error('Failed to fetch service status:', error);
    }
  };

  const restartService = async (serviceName: string) => {
    setLoading(prev => ({ ...prev, [serviceName]: true }));
    try {
      await fetch('/api/supervisor/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: serviceName })
      });
      // Refresh status after restart
      setTimeout(fetchStatus, 2000);
    } catch (error) {
      console.error('Failed to restart service:', error);
    } finally {
      setLoading(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="service-panel">
      <h3>Service Status</h3>
      {Object.entries(services).map(([name, service]) => (
        <div key={name} className="service-item">
          <span className={`status ${service.status}`}>
            {service.status}
          </span>
          <span className="service-name">{name}</span>
          <button
            onClick={() => restartService(name)}
            disabled={loading[name]}
          >
            {loading[name] ? 'Restarting...' : 'Restart'}
          </button>
        </div>
      ))}
    </div>
  );
};
```

### 2. Кнопки быстрого доступа

```typescript
// В верхней панели
const QuickActions = () => {
  const quickRestart = async (service: string) => {
    await fetch('/api/supervisor/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: service })
    });
  };

  return (
    <div className="quick-actions">
      <button onClick={() => quickRestart('brain')}>
        🔄 Brain
      </button>
      <button onClick={() => quickRestart('tts')}>
        🔊 TTS
      </button>
      <button onClick={() => quickRestart('memory')}>
        🧮 Memory
      </button>
    </div>
  );
};
```

## Конфигурация сервисов

### 1. Расширенная конфигурация

```json
{
  "brain": {
    "cmd": ["python", "-m", "uvicorn", "brain.main:app", "--host", "0.0.0.0", "--port", "7030"],
    "cwd": "/path/to/astra",
    "env": {
      "PYTHONUNBUFFERED": "1",
      "ASTRA_LOG_LEVEL": "INFO"
    },
    "optional": false,
    "health_check": {
      "url": "http://localhost:7030/",
      "timeout": 5
    },
    "restart_policy": {
      "max_restarts": 3,
      "backoff_seconds": 5
    }
  }
}
```

### 2. Health checks

```python
async def check_service_health(service_name: str, config: Dict) -> Dict:
    """Проверить здоровье сервиса"""
    health_config = config.get("health_check", {})

    if not health_config:
        return {"status": "unknown"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                health_config["url"],
                timeout=health_config.get("timeout", 5)
            )

            if response.status_code == 200:
                return {
                    "status": "healthy",
                    "response_time": response.elapsed.total_seconds() * 1000
                }
            else:
                return {
                    "status": "unhealthy",
                    "error": f"HTTP {response.status_code}"
                }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }
```

## Мониторинг и логи

### 1. Сбор метрик

```python
async def collect_metrics():
    """Собрать метрики всех сервисов"""
    metrics = {
        "timestamp": datetime.now().isoformat(),
        "services": {}
    }

    for name, process in service_processes.items():
        if process.returncode is None:
            try:
                ps_process = psutil.Process(process.pid)
                metrics["services"][name] = {
                    "cpu_percent": ps_process.cpu_percent(),
                    "memory_mb": ps_process.memory_info().rss / 1024 / 1024,
                    "threads": ps_process.num_threads(),
                    "connections": len(ps_process.connections()),
                    "uptime": (datetime.now() - ps_process.create_time()).seconds
                }
            except psutil.NoSuchProcess:
                metrics["services"][name] = {"status": "crashed"}

    return metrics
```

### 2. Логирование

```python
async def stream_service_logs(service_name: str, lines: int = 100):
    """Получить логи сервиса"""
    log_file = Path(f"logs/{service_name}.log")

    if not log_file.exists():
        return []

    with open(log_file, "r", encoding="utf-8") as f:
        lines_list = f.readlines()

    return lines_list[-lines:]
```

## Безопасность

### 1. Локальный доступ

```python
# Только localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"]
)
```

### 2. Аутентификация

```python
# Базовая аутентификация для продакшена
from fastapi.security import HTTPBasic, HTTPBasicCredentials

security = HTTPBasic()

@app.get("/status")
async def get_status(credentials: HTTPBasicCredentials = Depends(security)):
    # Проверить credentials
    pass
```

## Преимущества Supervisor API

1. **Горячая перезагрузка** - перезапуск сервисов без остановки системы
2. **Мониторинг** - реальное время статус и метрики
3. **Логи** - доступ к логам через API
4. **Управление** - простой интерфейс для операций
5. **Интеграция** - легко интегрируется с UI и другими сервисами
6. **Безопасность** - локальный доступ, опциональная аутентификация

## Следующие шаги

1. Создать базовый supervisor сервис
2. Добавить интеграцию с brain сервисом
3. Реализовать UI компоненты
4. Добавить health checks
5. Тестирование с реальными сервисами
6. Документация API