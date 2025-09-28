#!/usr/bin/env python3
"""
Astra Supervisor — Улучшенный Textual UI

Современный интерфейс с:
- Цветными логами по сервисам
- Детальными метриками (CPU, Memory, Health)
- Стабильным управлением процессами
- Фильтрацией и поиском логов
- Графиками производительности
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import signal
import sys
import time
import threading
import queue
import subprocess
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List
from pathlib import Path
from datetime import datetime

try:
    import psutil
except ImportError:
    psutil = None

from rich.text import Text
from rich.console import Console

from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, Container
from textual.widgets import (
    Header, Footer, Button, Label, Input, Select, 
    Log, Checkbox, Static, DataTable, Tabs, Tab,
    ProgressBar, Switch, Rule
)
from textual.screen import Screen

# --- Конфигурация ---
ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

CONFIG_PATH = ROOT / "astra_services.json"
SHARED_CONFIG_PATH = ROOT / ".astra_last_config.json"

# Паттерны для логов
LEVEL_RE = re.compile(r"\b(DEBUG|INFO|WARNING|ERROR|CRITICAL|TRACE)\b", re.I)
ERROR_PATTERNS = [
    re.compile(r"error", re.I),
    re.compile(r"exception", re.I),
    re.compile(r"traceback", re.I),
    re.compile(r"failed", re.I),
    re.compile(r"fatal", re.I)
]

CREATE_NEW_PROCESS_GROUP = 0x00000200 if sys.platform == "win32" else 0

# --- Метаданные сервисов ---
SERVICES_CONFIG = {
    "voice-in": {
        "color": "bright_blue", 
        "optional": True,
        "description": "Voice Input Handler",
        "icon": "🎤"
    },
    "stt": {
        "color": "bright_magenta", 
        "optional": True,
        "description": "Speech-to-Text Service",
        "icon": "🗣️"
    },
    "brain": {
        "color": "bright_yellow", 
        "optional": False,
        "description": "AI Brain Core",
        "icon": "🧠"
    },
    "tts": {
        "color": "bright_cyan", 
        "optional": True,
        "description": "Text-to-Speech Service",
        "icon": "🔊"
    },
    "health": {
        "color": "bright_green", 
        "optional": False,
        "description": "Health Monitor",
        "icon": "💚"
    },
    "memory": {
        "color": "bright_red", 
        "optional": False,
        "description": "Memory Manager",
        "icon": "🧮"
    },
    "rag": {
        "color": "blue", 
        "optional": False,
        "description": "RAG System",
        "icon": "📚"
    },
}

# --- Утилиты ---
def load_services() -> Dict[str, Dict]:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[astra-supervisor] Failed to load {CONFIG_PATH.name}: {e}")
    return {}

def load_shared_config() -> dict:
    if SHARED_CONFIG_PATH.exists():
        try:
            return json.loads(SHARED_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def get_log_level_style(text: str, base_color: str) -> str:
    """Определяет стиль на основе уровня лога"""
    text_upper = text.upper()
    
    if any(pattern.search(text) for pattern in ERROR_PATTERNS):
        return "bold red"
    elif "WARNING" in text_upper or "WARN" in text_upper:
        return "bold yellow"
    elif "DEBUG" in text_upper:
        return "dim white"
    elif "INFO" in text_upper:
        return base_color
    elif "SUCCESS" in text_upper or "READY" in text_upper:
        return "bold green"
    
    return base_color

# --- Чтение потоков ---
def enhanced_pipe_reader(pipe, thread_queue: queue.Queue, name: str):
    """Улучшенный читатель потоков с буферизацией"""
    try:
        buffer = ""
        while True:
            try:
                chunk = pipe.read(1024).decode('utf-8', errors='replace')
                if not chunk:
                    break
                    
                buffer += chunk
                lines = buffer.split('\n')
                buffer = lines[-1]  # Сохраняем неполную строку
                
                for line in lines[:-1]:
                    if line.strip():
                        thread_queue.put({
                            "type": "log_line", 
                            "name": name, 
                            "text": line.strip(), 
                            "timestamp": time.time()
                        })
                        
            except Exception as e:
                thread_queue.put({
                    "type": "log_line", 
                    "name": name, 
                    "text": f"[pipe-error] {e}", 
                    "timestamp": time.time()
                })
                break
                
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except:
            pass

# --- Данные процесса ---
@dataclass
class ServiceMetrics:
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    uptime: float = 0.0
    restart_count: int = 0
    last_error: Optional[str] = None
    health_status: str = "unknown"

@dataclass
class ServiceProc:
    name: str
    proc: subprocess.Popen
    thread: threading.Thread
    started_at: float = field(default_factory=time.time)
    ps: Optional["psutil.Process"] = None
    metrics: ServiceMetrics = field(default_factory=ServiceMetrics)
    log_buffer: List[str] = field(default_factory=list)

# --- Супервизор ---
class EnhancedSupervisor:
    def __init__(self, services: Dict[str, Dict], thread_queue: queue.Queue):
        self.services_cfg = services
        self.procs: Dict[str, ServiceProc] = {}
        self._log_files: Dict[str, Any] = {}
        self.thread_queue = thread_queue
        self.shared_config = load_shared_config()
        self.console = Console()
        
        if self.shared_config:
            print(f"[astra-supervisor] Loaded config for: {self.shared_config.get('personality', 'default')}")

    def start_service(self, name: str) -> None: 
        """Запуск сервиса с улучшенным управлением"""
        if name in self.procs and self.procs[name].proc.poll() is None:
            return

        cfg = self.services_cfg.get(name)
        if not cfg:
            self.thread_queue.put({
                "type": "log_line", 
                "name": name, 
                "text": f"[supervisor] Configuration not found", 
                "timestamp": time.time()
            })
            return

        # Подготовка окружения
        env = os.environ.copy()
        if self.shared_config:
            env.update({
                "PYTHONUTF8": "1",
                "PYTHONUNBUFFERED": "1",
                "ASTRA_AGENT_ID": self.shared_config.get("personality", "default"),
                "ASTRA_LLM_PROVIDER": self.shared_config.get("llm_provider", "openai"),
                "ASTRA_TTS_PROVIDER": self.shared_config.get("tts_provider", "xtts"),
                "ASTRA_STT_PROVIDER": self.shared_config.get("stt_provider", "whisper"),
            })
        
        env.update(cfg.get("env", {}))

        # Создание процесса
        creationflags = CREATE_NEW_PROCESS_GROUP
        preexec_fn = os.setsid if sys.platform != "win32" else None

        try:
            proc = subprocess.Popen(
                cfg["cmd"],
                cwd=cfg.get("cwd", ROOT),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                creationflags=creationflags,
                preexec_fn=preexec_fn,
                bufsize=0  # Отключаем буферизацию
            )
        except Exception as e:
            self.thread_queue.put({
                "type": "log_line", 
                "name": name, 
                "text": f"[supervisor] Failed to start: {e}", 
                "timestamp": time.time()
            })
            return

        # Настройка мониторинга
        ps = None
        if psutil and proc.pid:
            try:
                ps = psutil.Process(proc.pid)
            except psutil.NoSuchProcess:
                pass

        # Запуск потока чтения логов
        reader_thread = threading.Thread(
            target=enhanced_pipe_reader, 
            args=(proc.stdout, self.thread_queue, name), 
            daemon=True,
            name=f"reader-{name}"
        )
        reader_thread.start()

        # Сохранение информации о процессе
        service_proc = ServiceProc(
            name=name, 
            proc=proc, 
            thread=reader_thread, 
            ps=ps,
            started_at=time.time()
        )
        
        if name in self.procs:
            # Увеличиваем счетчик перезапусков
            service_proc.metrics.restart_count = self.procs[name].metrics.restart_count + 1
        
        self.procs[name] = service_proc

        # Открытие лог-файла
        try:
            self._log_files[name] = open(
                LOG_DIR / f"{name}.log", 
                "a", 
                encoding="utf-8", 
                buffering=1  # Построчная буферизация
            )
        except Exception as e:
            print(f"Failed to open log file for {name}: {e}")

        self.thread_queue.put({
            "type": "log_line", 
            "name": name, 
            "text": f"[supervisor] Started (PID: {proc.pid})", 
            "timestamp": time.time()
        })

    def stop_service(self, name: str, timeout: float = 10.0) -> None: 
        """Остановка сервиса с таймаутом"""
        sp = self.procs.get(name)
        if not sp:
            return

        self.thread_queue.put({
            "type": "log_line", 
            "name": name, 
            "text": "[supervisor] Stopping...", 
            "timestamp": time.time()
        })

        if sp.proc.poll() is not None:
            self._finalize_service(name)
            return

        # Graceful shutdown
        self._send_terminate(sp.proc)
        try:
            sp.proc.wait(timeout=timeout)
            self.thread_queue.put({
                "type": "log_line", 
                "name": name, 
                "text": "[supervisor] Stopped gracefully", 
                "timestamp": time.time()
            })
        except subprocess.TimeoutExpired:
            self.thread_queue.put({
                "type": "log_line", 
                "name": name, 
                "text": "[supervisor] Force killing...", 
                "timestamp": time.time()
            })
            self._send_kill(sp.proc)
            try:
                sp.proc.wait(timeout=5.0)
            except subprocess.TimeoutExpired:
                pass

        self._finalize_service(name)

    def restart_service(self, name: str) -> None: 
        """Перезапуск сервиса"""
        self.stop_service(name)
        time.sleep(1)  # Небольшая пауза
        self.start_service(name)

    def stop_all(self) -> None: 
        """Остановка всех сервисов"""
        for name in list(self.procs.keys()):
            self.stop_service(name)

    def update_metrics(self) -> None: 
        """Обновление метрик всех процессов"""
        for name, sp in self.procs.items():
            if sp.proc.poll() is None and sp.ps:
                try:
                    sp.metrics.cpu_percent = sp.ps.cpu_percent()
                    memory_info = sp.ps.memory_info()
                    sp.metrics.memory_mb = memory_info.rss / 1024 / 1024
                    sp.metrics.uptime = time.time() - sp.started_at
                    sp.metrics.health_status = "running"
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    sp.metrics.health_status = "error"
            else:
                sp.metrics.health_status = "stopped"

    def get_service_stats(self) -> Dict[str, Any]:
        """Получение общей статистики"""
        total_services = len(self.services_cfg)
        running_services = sum(1 for sp in self.procs.values() if sp.proc.poll() is None)
        total_memory = sum(sp.metrics.memory_mb for sp in self.procs.values())
        total_cpu = sum(sp.metrics.cpu_percent for sp in self.procs.values())
        
        return {
            "total": total_services,
            "running": running_services,
            "stopped": total_services - running_services,
            "memory_mb": total_memory,
            "cpu_percent": total_cpu
        }

    def _send_terminate(self, proc: subprocess.Popen) -> None:
        """Отправка сигнала завершения"""
        try:
            if sys.platform == "win32":
                # Точечно посылаем BREAK в группу дочернего процесса,
                # чтобы не валить супервизор
                proc.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass

    def _send_kill(self, proc: subprocess.Popen) -> None:
        """Принудительное завершение процесса"""
        try:
            proc.kill()
        except (ProcessLookupError, PermissionError):
            pass

    def _finalize_service(self, name: str) -> None:
        """Финализация сервиса"""
        # Закрытие лог-файла
        lf = self._log_files.pop(name, None)
        if lf:
            try:
                lf.close()
            except:
                pass

        # Обновление метрик
        if name in self.procs:
            self.procs[name].metrics.health_status = "stopped"

# --- UI Приложение ---
class ModernSupervisorApp(App):
    """Современное приложение супервизора"""
    
    CSS = """
    Screen { 
        layout: vertical; 
        background: $surface;
    }
    
    .toolbar { 
        height: 5; 
        background: $primary-darken-1;
        border: solid $primary;
    }
    
    .content-area {
        height: 1fr;
    }
    
    .log-area { 
        height: 2fr;
        border: solid $accent;
    }
    
    .metrics-area { 
        height: 1fr;
        border: solid $secondary;
    }
    
    .stats-bar {
        height: 3;
        background: $success-darken-2;
    }
    
    Button {
        margin: 0 1;
        min-width: 12;
    }
    
    Button.success { background: $success; }
    Button.error { background: $error; }
    Button.warning { background: $warning; }
    
    Select {
        min-width: 20;
        margin: 0 1;
    }
    
    Input {
        margin: 0 1;
    }
    
    DataTable {
        background: $surface-lighten-1;
    }
    
    Log {
        background: $surface-darken-1;
        border: solid $accent-lighten-2;
    }
    
    .status-running { color: $success; }
    .status-stopped { color: $error; }
    .status-error { color: $warning; }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit", priority=True),
        Binding("s", "start_all", "Start All"),
        Binding("x", "stop_all", "Stop All"),
        Binding("r", "restart_selected", "Restart"),
        Binding("c", "clear_logs", "Clear Logs"),
        Binding("f", "toggle_filter", "Filter"),
        Binding("ctrl+r", "refresh_all", "Refresh"),
    ]

    def __init__(self, supervisor: EnhancedSupervisor, thread_queue: queue.Queue, services: Dict[str, Dict]):
        super().__init__()
        self.sup = supervisor
        self.services = services
        self.thread_queue = thread_queue
        
        # UI Components
        self.log_view: Optional[Log] = None
        self.service_select: Optional[Select[str]] = None
        self.metrics_table: Optional[DataTable] = None
        self.stats_labels: Dict[str, Label] = {}
        self.search_input: Optional[Input] = None
        self.auto_scroll: bool = True
        self.log_filter: str = "ALL"
        
        # Статистика
        self.message_count = 0
        self.last_stats_update = time.time()

    def compose(self) -> ComposeResult:
        """Создание интерфейса"""
        yield Header(show_clock=True)
        
        # Панель инструментов
        with Container(classes="toolbar"):
            with Horizontal():
                yield Label("🚀 Astra Supervisor", classes="title")
                self.service_select = Select(
                    options=[("ALL", "ALL")] + [(name, f"{SERVICES_CONFIG[name]['icon']} {name}") for name in self.services.keys()],
                    prompt="Filter Service",
                    value="ALL"
                )
                yield self.service_select
                
                self.search_input = Input(placeholder="Search logs...", classes="search")
                yield self.search_input
                
                yield Button("🚀 Start All", id="start_all", variant="success")
                yield Button("⏹️ Stop All", id="stop_all", variant="error")  
                yield Button("🔄 Restart", id="restart", variant="primary")
                yield Button("🗑️ Clear", id="clear", variant="default")

        # Статистика
        with Container(classes="stats-bar"):
            with Horizontal():
                self.stats_labels["total"] = Label("Services: 0")
                self.stats_labels["running"] = Label("Running: 0")
                self.stats_labels["memory"] = Label("Memory: 0 MB")
                self.stats_labels["cpu"] = Label("CPU: 0%")
                self.stats_labels["messages"] = Label("Messages: 0")
                
                for label in self.stats_labels.values():
                    yield label

        # Основное содержимое
        with Container(classes="content-area"):
            with Vertical():
                # Область логов
                self.log_view = Log(
                    classes="log-area",
                    auto_scroll=True
                )
                yield self.log_view
                
                yield Label("📊 Service Metrics")
                
                # Таблица метрик
                with Container(classes="metrics-area"):
                    self.metrics_table = DataTable(show_cursor=False)
                    self.metrics_table.add_columns(
                        "Service", "Status", "PID", "CPU%", "Memory", "Uptime", "Restarts"
                    )
                    yield self.metrics_table

        yield Footer()

    def on_mount(self) -> None:
        """Инициализация приложения"""
        self.set_interval(0.05, self.check_thread_queue)  # Быстрая обработка логов
        self.set_interval(2.0, self.refresh_metrics)       # Медленное обновление метрик
        self.set_interval(1.0, self.update_stats)          # Обновление статистики
        self.action_start_all()

    @on(Button.Pressed)
    def handle_buttons(self, event: Button.Pressed) -> None:
        """Обработка нажатий кнопок"""
        button_id = event.button.id
        
        if button_id == "start_all":
            self.action_start_all()
        elif button_id == "stop_all":
            self.action_stop_all()
        elif button_id == "restart":
            self.action_restart_selected()
        elif button_id == "clear":
            self.action_clear_logs()

    @on(Select.Changed)
    def on_service_filter_changed(self, event: Select.Changed) -> None:
        """Изменение фильтра сервисов"""
        if self.service_select:
            self.log_filter = self.service_select.value
            self.refresh_log_display()

    @on(Input.Submitted)
    def on_search_submitted(self, event: Input.Submitted) -> None:
        """Поиск в логах"""
        self.refresh_log_display()

    def check_thread_queue(self) -> None:
        """Проверка очереди сообщений от потоков"""
        processed = 0
        try:
            while processed < 50:  # Ограничиваем количество обрабатываемых сообщений за раз
                message = self.thread_queue.get_nowait()
                self.handle_log_message(message)
                processed += 1
        except queue.Empty:
            return

    def handle_log_message(self, message: dict) -> None:
        """Обработка сообщения лога"""
        if message.get("type") != "log_line":
            return
            
        name = message["name"]
        text = message["text"]
        timestamp = message.get("timestamp", time.time())
        
        self.message_count += 1
        
        # Запись в файл
        logf = self.sup._log_files.get(name)
        if logf:
            try:
                ts_str = datetime.fromtimestamp(timestamp).strftime("%H:%M:%S.%f")[:-3]
                logf.write(f"[{ts_str}] {text}\n")
                logf.flush()
            except Exception:
                pass

        # Добавление в буфер сервиса
        if name in self.sup.procs:
            self.sup.procs[name].log_buffer.append(f"[{datetime.fromtimestamp(timestamp).strftime('%H:%M:%S')}] {text}")
            # Ограничиваем размер буфера
            if len(self.sup.procs[name].log_buffer) > 1000:
                self.sup.procs[name].log_buffer = self.sup.procs[name].log_buffer[-500:]

        # Проверка ошибок для метрик
        if any(pattern.search(text) for pattern in ERROR_PATTERNS):
            if name in self.sup.procs:
                self.sup.procs[name].metrics.last_error = text[:100]

        # Отображение в UI
        self.display_log_message(name, text, timestamp)

    def display_log_message(self, name: str, text: str, timestamp: float) -> None:
        """Отображение сообщения в UI"""
        if not self.log_view:
            return
            
        # Проверка фильтров
        if self.log_filter != "ALL" and self.log_filter != name:
            return
            
        # Поиск
        if self.search_input and self.search_input.value:
            search_term = self.search_input.value.lower()
            if search_term not in text.lower() and search_term not in name.lower():
                return

        # Форматирование сообщения в обычную строку
        ts_str = datetime.fromtimestamp(timestamp).strftime("%H:%M:%S")
        icon = SERVICES_CONFIG.get(name, {}).get("icon", "🔧")
        
        plain_text = f"[{ts_str}] {icon} [{name:>8}] {text}\n"
        
        self.log_view.write(plain_text)

    def refresh_log_display(self) -> None:
        """Обновление отображения логов с учетом фильтров"""
        if not self.log_view:
            return
            
        self.log_view.clear()
        
        # Повторное отображение буферизованных сообщений
        for name, sp in self.sup.procs.items():
            if self.log_filter != "ALL" and self.log_filter != name:
                continue
                
            for buffered_line in sp.log_buffer[-100:]:
                if self.search_input and self.search_input.value:
                    search_term = self.search_input.value.lower()
                    if search_term not in buffered_line.lower():
                        continue
                        
                self.log_view.write_line(f"[{SERVICES_CONFIG.get(name, {}).get('icon', '🔧')} {name}] {buffered_line}")

    def refresh_metrics(self) -> None:
        """Обновление таблицы метрик"""
        if not self.metrics_table:
            return
            
        self.sup.update_metrics()
        self.metrics_table.clear()
        
        for name in sorted(self.services.keys()):
            sp = self.sup.procs.get(name)
            config = SERVICES_CONFIG.get(name, {})
            icon = config.get("icon", "🔧")
            
            if sp and sp.proc.poll() is None:
                # Сервис работает
                status_text = Text("🟢 RUNNING", style="bold green")
                pid = str(sp.proc.pid)
                cpu = f"{sp.metrics.cpu_percent:.1f}%"
                memory = f"{sp.metrics.memory_mb:.1f}MB"
                uptime_seconds = int(sp.metrics.uptime)
                hours = uptime_seconds // 3600
                minutes = (uptime_seconds % 3600) // 60
                seconds = uptime_seconds % 60
                uptime = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                restarts = str(sp.metrics.restart_count)
            else:
                # Сервис остановлен
                status_text = Text("🔴 STOPPED", style="bold red")
                pid = "-"
                cpu = "-"
                memory = "-"
                uptime = "-"
                restarts = str(sp.metrics.restart_count) if sp else "0"
            
            self.metrics_table.add_row(
                f"{icon} {name}",
                status_text,
                pid,
                cpu,
                memory,
                uptime,
                restarts
            )

    def update_stats(self) -> None:
        """Обновление общей статистики"""
        stats = self.sup.get_service_stats()
        
        self.stats_labels["total"].update(f"Services: {stats['total']}")
        self.stats_labels["running"].update(f"🟢 Running: {stats['running']}")
        self.stats_labels["memory"].update(f"💾 Memory: {stats['memory_mb']:.1f} MB")
        self.stats_labels["cpu"].update(f"⚡ CPU: {stats['cpu_percent']:.1f}%")
        self.stats_labels["messages"].update(f"📨 Messages: {self.message_count}")

    # --- Actions ---
    def action_start_all(self) -> None:
        """Запуск всех сервисов"""
        enabled_services = self.sup.shared_config.get("enabled_services", {})
        
        for name in self.services.keys():
            config = SERVICES_CONFIG.get(name, {})
            is_optional = config.get("optional", False)
            
            if not is_optional or (is_optional and enabled_services.get(name, False)):
                self.sup.start_service(name)

    def action_stop_all(self) -> None:
        """Остановка всех сервисов"""
        self.sup.stop_all()

    def action_restart_selected(self) -> None:
        """Перезапуск выбранного сервиса"""
        if not self.service_select:
            return
            
        selected = self.service_select.value
        if selected == "ALL":
            self.action_stop_all()
            # Небольшая задержка перед перезапуском
            self.set_timer(2.0, self.action_start_all)
        elif selected in self.services:
            self.sup.restart_service(selected)

    def action_clear_logs(self) -> None:
        """Очистка логов"""
        if self.log_view:
            self.log_view.clear()
        
        # Очистка буферов сервисов
        for sp in self.sup.procs.values():
            sp.log_buffer.clear()

    def action_toggle_filter(self) -> None:
        """Переключение фильтра"""
        if self.service_select:
            options = list(self.service_select.options)
            current_index = next((i for i, (value, _) in enumerate(options) if value == self.service_select.value), 0)
            next_index = (current_index + 1) % len(options)
            self.service_select.value = options[next_index][0]

    def action_refresh_all(self) -> None:
        """Обновление всех данных"""
        self.refresh_metrics()
        self.update_stats()

    def action_quit(self) -> None:
        """Выход из приложения"""
        self.sup.stop_all()
        self.exit()

# --- Экран деталей сервиса ---
class ServiceDetailScreen(Screen):
    """Экран с детальной информацией о сервисе"""
    
    def __init__(self, service_name: str, supervisor: EnhancedSupervisor):
        super().__init__()
        self.service_name = service_name
        self.supervisor = supervisor

    def compose(self) -> ComposeResult:
        config = SERVICES_CONFIG.get(self.service_name, {})
        icon = config.get("icon", "🔧")
        
        yield Header(f"{icon} {self.service_name} Details")
        
        with Vertical():
            yield Label(f"Service: {config.get('description', 'Unknown')}")
            yield Label(f"Status: {'Running' if self.service_name in self.supervisor.procs else 'Stopped'}")
            
            # Подробные метрики
            sp = self.supervisor.procs.get(self.service_name)
            if sp:
                yield Label(f"PID: {sp.proc.pid}")
                yield Label(f"Started: {datetime.fromtimestamp(sp.started_at).strftime('%Y-%m-%d %H:%M:%S')}")
                yield Label(f"Uptime: {int(sp.metrics.uptime)}s")
                yield Label(f"CPU: {sp.metrics.cpu_percent:.2f}%")
                yield Label(f"Memory: {sp.metrics.memory_mb:.2f} MB")
                yield Label(f"Restarts: {sp.metrics.restart_count}")
                
                if sp.metrics.last_error:
                    yield Label(f"Last Error: {sp.metrics.last_error}", classes="error")
            
            # Кнопки управления
            with Horizontal():
                yield Button("Start", id="start")
                yield Button("Stop", id="stop")
                yield Button("Restart", id="restart")
                yield Button("Back", id="back")

    @on(Button.Pressed)
    def handle_detail_buttons(self, event: Button.Pressed) -> None:
        if event.button.id == "start":
            self.supervisor.start_service(self.service_name)
        elif event.button.id == "stop":
            self.supervisor.stop_service(self.service_name)
        elif event.button.id == "restart":
            self.supervisor.restart_service(self.service_name)
        elif event.button.id == "back":
            self.app.pop_screen()

# --- Главная функция ---
def main() -> int:
    """Точка входа приложения"""
    # Загрузка конфигурации
    services = load_services()
    if not services:
        print("❌ FATAL: No services configured in astra_services.json", file=sys.stderr)
        print("Please ensure the configuration file exists and contains service definitions.", file=sys.stderr)
        return 1

    print("🚀 Starting Astra Supervisor...")
    print(f"📁 Log directory: {LOG_DIR}")
    print(f"⚙️  Services configured: {len(services)}")

    # Создание очереди и супервизора
    thread_queue = queue.Queue(maxsize=10000)  # Большая очередь для стабильности
    supervisor = EnhancedSupervisor(services, thread_queue)
    
    # Создание и запуск приложения
    app = ModernSupervisorApp(supervisor, thread_queue, services)
    
    try:
        print("🎯 Launching UI...")
        app.run()
        return 0 # Return 0 on successful exit
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
        return 0
    except Exception as e:
        print(f"💥 Application error: {e}", file=sys.stderr)
        return 1
    finally:
        print("🧹 Cleaning up...")
        supervisor.stop_all()
        
        # Закрытие всех лог-файлов
        for logf in supervisor._log_files.values():
            try:
                logf.close()
            except:
                pass

if __name__ == "__main__":
    # Игнорируем SIGINT, чтобы CTRL_BREAK_EVENT детям не ронял супервизор
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    if sys.platform != "win32":
        # На POSIX всё ок — оставим аккуратное завершение по SIGTERM
        def _term_handler(signum, frame):
            print(f"\n🛑 Received SIGTERM, shutting down...")
            sys.exit(0)
        signal.signal(signal.SIGTERM, _term_handler)
    
    try:
        exit_code = main()
        sys.exit(exit_code)
    except Exception as e:
        print(f"💀 Fatal error: {e}", file=sys.stderr)
        sys.exit(1)
