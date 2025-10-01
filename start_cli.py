from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
import os
import subprocess
import sys
import time
import threading
import httpx
import signal
import socket
import concurrent.futures
from typing import Dict, Any, List, Optional
import argparse
import re
from datetime import datetime
from collections import deque, defaultdict
import textwrap
from config import get_config

# Rich and colorama for better terminal output
try:
    import rich
    from rich.console import Console
    from rich.text import Text
    from rich.panel import Panel
    import colorama
    colorama.init(autoreset=True)
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

# --- Service Configuration ---
SERVICES = {
    "voice-in": {"color": "blue", "optional": True},
    "stt":      {"color": "magenta", "optional": True},
    "brain":    {"color": "yellow", "optional": False},
    "tts":      {"color": "cyan", "optional": True},
    "health":   {"color": "green", "optional": False},
    "memory":   {"color": "red", "optional": False},
#    "rag":      {"color": "blue", "optional": True},
}



def print_color(text: str, color: str, timestamp: bool = True):
    """Prints text in a given color with optional timestamp using rich."""
    if RICH_AVAILABLE:
        console = Console()
        if timestamp:
            ts = datetime.now().strftime("%H:%M:%S")
            text = f"[{ts}] {text}"
        try:
            console.print(text, style=color.lower())
        except Exception:
            print(text)
    else:
        if timestamp:
            ts = datetime.now().strftime("%H:%M:%S")
            text = f"[{ts}] {text}"
        print(text)

def safe_print(text, style=None):
    """Safe print with Unicode error handling."""
    try:
        if RICH_AVAILABLE and style:
            console = Console()
            console.print(text, style=style)
        else:
            print(text)
    except UnicodeEncodeError:
        # Fallback for Unicode issues
        safe_text = text.encode('ascii', errors='replace').decode('ascii')
        print(safe_text)

def get_log_level_color(line: str, base_color: str) -> str:
    """Determine rich style based on log level."""
    line_upper = line.upper()
    if "ERROR" in line_upper or "TRACEBACK" in line_upper or "CRITICAL" in line_upper or "FATAL" in line_upper:
        return "red"
    return base_color

class LogFormatter:
    """Formatter for log messages with multiline support and colors."""
    
    def __init__(self, terminal_width: int = None, no_colors: bool = False, compact_mode: bool = False):
        self.terminal_width = terminal_width or os.get_terminal_size().columns
        self.service_name_width = 10  # Fixed width for service names
        self.timestamp_width = 13     # [HH:MM:SS.mmm]
        self.level_width = 8          # [WARNING]
        self.separator_width = 3      # " │ "
        self.no_colors = no_colors
        self.compact_mode = compact_mode
        
    def detect_multiline(self, message: str) -> List[str]:
        """Detect and split multiline messages."""
        if '\n' in message:
            return message.split('\n')
        return [message]
        
    def calculate_available_width(self) -> int:
        """Calculate available width for message text."""
        prefix_width = self.timestamp_width + self.service_name_width + self.level_width + self.separator_width
        return self.terminal_width - prefix_width
        
    def get_level_color(self, level: str) -> str:
        """Get Rich style for log level."""
        level_upper = level.upper()
        if level_upper == 'DEBUG':
            return 'dim gray'
        elif level_upper == 'INFO':
            return 'green'  # or 'white' as alternative
        elif level_upper == 'WARNING':
            return 'yellow'
        elif level_upper in ('ERROR', 'CRITICAL'):
            return 'red' if level_upper == 'ERROR' else 'bold red'
        return 'white'
        
    def wrap_text(self, text: str, width: int, indent: str = "                                   ") -> List[str]:
        """Wrap text with indentation for continuations."""
        if len(text) <= width:
            return [text]
        wrapped_lines = textwrap.wrap(text, width=width)
        # Add indent to all but first line
        indented_lines = [wrapped_lines[0]] if wrapped_lines else []
        for line in wrapped_lines[1:]:
            indented_lines.append(indent + line)
        return indented_lines
        
    def format_message(self, timestamp: str, service: str, level: str, message: str) -> List[Any]:
        """Format a log message, handling multiline and wrapping."""
        if self.compact_mode:
            # Compact mode: simple format without colors or symbols
            lines = self.detect_multiline(message)
            compact_lines = []
            prefix_len = len(f"{timestamp} {service:>8} │ ")
            indent = " " * prefix_len
            for i, line in enumerate(lines):
                if i == 0:
                    compact_line = f"{timestamp} {service:>8} │ {line}"
                    if len(compact_line) > self.terminal_width:
                        wrapped = self.wrap_text(line, self.terminal_width - prefix_len)
                        compact_lines.append(f"{timestamp} {service:>8} │ {wrapped[0]}")
                        for w in wrapped[1:]:
                            compact_lines.append(indent + w)
                    else:
                        compact_lines.append(compact_line)
                else:
                    symbol = "└─ " if i == len(lines) - 1 else "├─ "
                    continuation = indent + symbol + line
                    if len(continuation) > self.terminal_width:
                        wrapped = self.wrap_text(line, self.terminal_width - prefix_len - 3)  # -3 for "├─ "
                        compact_lines.append(indent + symbol + wrapped[0])
                        for w in wrapped[1:]:
                            compact_lines.append(indent + "   " + w)
                    else:
                        compact_lines.append(continuation)
            return compact_lines

        lines = self.detect_multiline(message)
        available_width = self.calculate_available_width()

        service_padded = f"{service:<{self.service_name_width}}"
        level_padded = f"{level:<{self.level_width}}"
        first_line_prefix = f"[{timestamp}] [{service_padded}] [{level_padded}] │ "

        formatted_lines = []
        if len(lines) == 1:
            # Single line
            first_line_msg = lines[0]
            if len(first_line_prefix + first_line_msg) > self.terminal_width:
                # Need wrapping
                wrapped = self.wrap_text(first_line_msg, available_width)
                formatted_lines.append(first_line_prefix + wrapped[0])
                indent = " " * len(first_line_prefix)
                for w_line in wrapped[1:]:
                    formatted_lines.append(indent + w_line)
            else:
                formatted_lines.append(first_line_prefix + first_line_msg)
        else:
            # Multiline
            formatted_lines.append(first_line_prefix + lines[0])
            indent = " " * len(first_line_prefix)
            for i, line in enumerate(lines[1:], 1):
                if line.strip():
                    wrapped = self.wrap_text(line, available_width)
                    symbol = "└─ " if i == len(lines) - 1 else "├─ "
                    formatted_lines.append(indent + symbol + wrapped[0])
                    for w_line in wrapped[1:]:
                        formatted_lines.append(indent + "   " + w_line)

        if self.no_colors:
            return formatted_lines

        # Apply colors
        colored_lines = []
        for line in formatted_lines:
            text = Text()
            if line.startswith(f"[{timestamp}]"):
                # Parse and colorize main line
                text.append(f"[{timestamp}] ", style="dim white")
                text.append(f"[{service_padded}] ", style=f"bold {SERVICES.get(service, {}).get('color', 'white')}")
                text.append(f"[{level_padded}] ", style=self.get_level_color(level))
                text.append("│ ", style="white")
                msg_start = line.find("│ ") + 2
                text.append(line[msg_start:], style=self.get_level_color(level))
            else:
                # Continuation line
                if "├─" in line or "└─" in line:
                    symbol_pos = line.find("├─") if "├─" in line else line.find("└─")
                    text.append(line[:symbol_pos + 2], style="dim white")
                    text.append(line[symbol_pos + 2:], style=self.get_level_color(level))
                else:
                    text.append(line, style=self.get_level_color(level))
            colored_lines.append(text)

        return colored_lines

class ServiceStatusTracker:
    """Tracks status of services based on log levels and message counts."""

    def __init__(self):
        self._lock = threading.RLock()  # Reentrant lock for nested calls
        self._services = defaultdict(lambda: {
            'status': '✗',  # Default unknown
            'last_level': None,
            'last_message': '',
            'message_count': 0,
            'level_counts': defaultdict(int),
            'last_update': time.time()
        })
        
    def update_service_status(self, service: str, level: str, message: str):
        """Update service status based on log level and message."""
        with self._lock:
            service_data = self._services[service]
            service_data['message_count'] += 1
            service_data['level_counts'][level] += 1
            service_data['last_level'] = level
            service_data['last_message'] = message
            service_data['last_update'] = time.time()

            # Determine status symbol
            if level in ('ERROR', 'CRITICAL'):
                service_data['status'] = '✗'
            elif level == 'WARNING':
                service_data['status'] = '⚠'
            elif service_data['status'] == '✗': # Don't override error state with info
                pass
            elif level in ('INFO', 'DEBUG'):
                service_data['status'] = '✓'
            else:
                service_data['status'] = '?'  # Unknown
    
    def get_status_bar(self) -> Panel:
        """Return a Rich Panel with service status header including statistics."""
        with self._lock:
            if not self._services:
                return Panel("No services active", title="ASTRA VOICE AGENT STATUS")

            status_parts = []
            for service, data in sorted(self._services.items()):
                count_str = f"{data['message_count']} msg" if data['message_count'] < 1000 else f"{data['message_count']/1000:.1f}k msg"
                stats_str = ", ".join([f"{k}:{v}" for k, v in sorted(data['level_counts'].items()) if v > 0])
                status_str = f"[{service}: {data['status']} {count_str} | {stats_str}]"
                status_parts.append(status_str)

        status_line = " ".join(status_parts)
        panel = Panel(status_line, title="ASTRA VOICE AGENT STATUS", border_style="green")
        return panel

class LogBuffer:
    """Thread-safe buffer for log messages to prevent mixing."""
    
    def __init__(self, buffer_size: int = 100):
        self.buffer = deque(maxlen=buffer_size)
        self.lock = threading.Lock()
        
    def add_message(self, formatted_message: List[Any]):
        """Add formatted message to buffer."""
        with self.lock:
            for item in formatted_message:
                self.buffer.append(item)
                
    def flush_to_console(self, console: Optional[Console] = None):
        """Flush buffer to console in order."""
        with self.lock:
            while self.buffer:
                item = self.buffer.popleft()
                if isinstance(item, str):
                    print(item)
                else:
                    # Assume Text object
                    if console and RICH_AVAILABLE:
                        console.print(item)
                    else:
                        plain_line = item.plain if hasattr(item, 'plain') else str(item)
                        print(plain_line)

def load_port_for_service(service_name: str) -> str:
    """Loads the port number from the .port file for a given service."""
    port_file = os.path.join(os.path.dirname(__file__), service_name, ".port")
    try:
        with open(port_file, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "0"

def check_service_health(service_name: str, port: str, timeout: int = 3) -> bool:
    """Check if a service is responding by trying to open a TCP connection."""
    try:
        with socket.create_connection(("localhost", int(port)), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError):
        return False

def wait_for_service_startup(service_name: str, port: str, max_wait: int = 30) -> bool:
    """Wait for a service to become available."""
    print_color(f"Waiting for {service_name} to start on port {port}...", "cyan", timestamp=False)
    for attempt in range(max_wait):
        if check_service_health(service_name, port):
            print_color(f"✓ {service_name} is ready!", "green", timestamp=False)
            return True
        time.sleep(1)
    print_color(f"✗ Timeout waiting for {service_name} to start", "red")
    return False

def graceful_shutdown(processes: List[tuple[str, subprocess.Popen]], timeout: int = 10):
    """Perform graceful shutdown of all processes."""
    if not processes:
        return
    print_color("\n--- Initiating graceful shutdown ---", "yellow")
    for name, process in reversed(processes):
        if process.poll() is None:
            try:
                print_color(f"Sending termination signal to {name} (PID: {process.pid})", "yellow", timestamp=False)
                if sys.platform == "win32":
                    # Use taskkill to forcefully terminate the process tree on Windows
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(process.pid)])
                else:
                    # Send SIGTERM to the process group
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            except Exception as e:
                print_color(f"Error sending signal to {name}: {e}", "red")
    
    print_color(f"Waiting up to {timeout} seconds for services to stop...", "cyan")
    for name, process in reversed(processes):
        try:
            process.wait(timeout=timeout)
            print_color(f"✓ {name} stopped gracefully.", "green", timestamp=False)
        except subprocess.TimeoutExpired:
            print_color(f"✗ {name} did not stop in time, force killing...", "red")
            process.kill()
            print_color(f"✗ {name} force killed.", "yellow", timestamp=False)
        except Exception as e:
            print_color(f"Error waiting for {name} to stop: {e}", "red")
    print_color("--- Shutdown complete ---", "green")

def raw_stream_reader(stream, prefix: str):
    """A simple, dumb reader that just prints every line from a stream for debugging."""
    for line in iter(stream.readline, ''):
        if not line:
            break
        print(f"[{prefix}] {line.strip()}")
    stream.close()

def run_services(config: Dict[str, Any]):
    """Service management with error handling and monitoring."""
    processes = []
    threads = []
    # Adapt to nested config structure
    enabled_services = config.get("launcher", {}).get("enabled_services", {})
    
    # Initialize shared objects
    status_tracker = ServiceStatusTracker()
    show_status_bar = config.get("show_status_bar", True)
    
    buffer_size = config.get("buffer_size", 100)
    log_buffer = LogBuffer(buffer_size) if buffer_size > 0 else None
    
    console = Console() if RICH_AVAILABLE and not config.get("no_colors", False) else None
    
    # Setup file logging if enabled
    logger = None
    log_file = config.get("log_file")
    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        log_level = getattr(logging, config.get("log_level", "INFO"))
        logger = logging.getLogger("astra")
        logger.setLevel(log_level)
        
        rotation = config.get("log_rotation", "daily")
        if rotation == "daily":
            handler = TimedRotatingFileHandler(log_file, when='midnight', backupCount=7, encoding='utf-8')
        elif rotation.startswith("size:"):
            size_str = rotation.split(":")[1].replace("MB", "")
            try:
                max_bytes = int(float(size_str)) * 1024 * 1024
                handler = RotatingFileHandler(log_file, maxBytes=max_bytes, backupCount=7, encoding='utf-8')
            except ValueError:
                print_color(f"Invalid rotation size '{size_str}MB', using FileHandler", "yellow")
                handler = logging.FileHandler(log_file, encoding='utf-8')
        else:
            handler = logging.FileHandler(log_file, encoding='utf-8')
        
        formatter = logging.Formatter('[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.propagate = False
    
    personality = config.get("personalities", {}).get("default", "default")
    llm_provider = config.get("llm", {}).get("provider", "openai")
    tts_provider = config.get("voice", {}).get("tts", {}).get("provider", "xtts")
    stt_provider = config.get("voice", {}).get("stt", {}).get("provider", "whisper")

    print_color("\n=== Astra Voice Agent Starting ===", "bold")
    print_color(f"Personality: {personality}", "cyan")
    print_color("\n--- Launching Services ---", "green")
    
    try:
        base_env = os.environ.copy()
        project_root = os.path.dirname(__file__)
        
        # Add project root to PYTHONPATH to ensure modules are found
        python_path = base_env.get('PYTHONPATH', '')
        if project_root not in python_path.split(os.pathsep):
            base_env['PYTHONPATH'] = f"{project_root}{os.pathsep}{python_path}"

        base_env.update({
            "PYTHONUTF8": "1",
            "ASTRA_CONFIG_ENABLED": "true",
            "ASTRA_AGENT_ID": personality,
            "ASTRA_LLM_PROVIDER": llm_provider,
            "ASTRA_TTS_PROVIDER": tts_provider,
            "ASTRA_STT_PROVIDER": stt_provider,
            "ASTRA_LOG_LEVEL": config.get("log_level", "INFO"),
        })
        
        for name, properties in SERVICES.items():
            if properties.get("optional") and not enabled_services.get(name, False):
                print_color(f"Skipping {name} (disabled by user)", "dim")
                continue
            
            port = load_port_for_service(name)
            if port == "0":
                print_color(f"Skipping {name} (no port configured)", "dim")
                continue
            
            service_dir = os.path.join(os.path.dirname(__file__), name)

            # --- ASTRA REFACTORING ---
            app_path = f"{name}.main:app"
            if name == "brain":
                print_color("Redirecting 'brain' service to refactored 'brain_service.main:app'", "bold yellow")
                app_path = "brain_service.main:app"
            # --- END REFACTORING ---

            if sys.platform == "win32":
                venv_python = os.path.join(service_dir, ".venv", "Scripts", "python.exe")
            else:
                venv_python = os.path.join(service_dir, ".venv", "bin", "python")
            if not os.path.exists(venv_python):
                print_color(f"Warning: Python executable not found for '{name}' at {venv_python}. Skipping.", "yellow")
                continue
            
            command = [venv_python, "-u", "-m", "uvicorn", app_path, "--host", "0.0.0.0", "--port", port]
            
            try:
                print_color(f"Starting {name} on port {port}...", properties["color"])
                
                # Process creation flags for proper signal handling
                creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
                preexec_fn = os.setsid if sys.platform != "win32" else None
                
                process = subprocess.Popen(
                    command,
                    cwd=os.path.dirname(__file__), # ALWAYS run from project root
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    env=base_env,
                    creationflags=creationflags,
                    preexec_fn=preexec_fn
                )
                
                processes.append((name, process))

                # --- ASTRA DEBUGGING ---
                if name == "brain":
                    # Use a raw reader for debugging brain startup
                    print_color(f"Using RAW stream reader for '{name}' debugging.", "bold red")
                    thread = threading.Thread(target=raw_stream_reader, args=(process.stdout, "RAW-BRAIN"), daemon=True)
                else:
                    # Use the normal formatted reader
                    compact_mode = config.get("formatting", {}).get("compact_mode", False)
                    formatter = LogFormatter(no_colors=config.get("no_colors", False), compact_mode=compact_mode)
                    filters = config.get("filters", {})
                    search_pattern = config.get("search_pattern", "")
                    thread = threading.Thread(target=stream_reader, args=(process.stdout, name, properties["color"], formatter, status_tracker, log_buffer, logger, filters, search_pattern, console), daemon=True)
                # --- END DEBUGGING ---
                
                thread.start()
                threads.append(thread)
                
            except Exception as e:
                print_color(f"Failed to start {name}: {e}", "red")
                continue
        
        if not processes:
            print_color("No services were started. Exiting.", "red")
            return
        
        print_color(f"\n--- Services launched. Waiting for initialization... ---", "green")
        critical_services = [p[0] for p in processes if not SERVICES[p[0]].get("optional")]
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(critical_services)) as executor:
            futures = [executor.submit(wait_for_service_startup, name, load_port_for_service(name)) for name in critical_services]
            for future in concurrent.futures.as_completed(futures):
                if not future.result():
                    print_color("A critical service failed to start. System may be unstable.", "red")
        
        print_color(f"\n{ '='*60}", "green")
        print_color("🎙️  ASTRA VOICE AGENT IS READY", "bold")
        print_color("Press Ctrl+C to stop gracefully", "cyan")
        print_color(f"{ '='*60}", "green")
        
        # Initial status bar
        if status_tracker and show_status_bar:
            if console:
                console.print(status_tracker.get_status_bar())
            else:
                status_parts = []
                for service, data in sorted(status_tracker._services.items()):
                    count_str = f"{data['message_count']} msg" if data['message_count'] < 1000 else f"{data['message_count']/1000:.1f}k msg"
                    stats_str = ", ".join([f"{k}:{v}" for k, v in sorted(data['level_counts'].items()) if v > 0])
                    status_parts.append(f"[{service}: {data['status']} {count_str} | {stats_str}]")
                print("\n┌─ ASTRA VOICE AGENT STATUS ─────────────────────────────────────────┐")
                print(f"│ {' '.join(status_parts)} │")
                print("└────────────────────────────────────────────────────────────────────┘\n")
        
        last_status_update = time.time()
        last_log_flush = time.time()
        status_update_interval = 10  # Update status bar every 10 seconds
        log_flush_interval = 1      # Flush logs every 1 second

        while True:
            time.sleep(0.5)  # Main loop sleep
            current_time = time.time()

            # --- Status Bar Update Logic ---
            if show_status_bar and (current_time - last_status_update >= status_update_interval):
                if status_tracker:
                    if console:
                        console.print(status_tracker.get_status_bar())
                    else:
                        status_parts = []
                        for service, data in sorted(status_tracker._services.items()):
                            count_str = f"{data['message_count']} msg" if data['message_count'] < 1000 else f"{data['message_count']/1000:.1f}k msg"
                            stats_str = ", ".join([f"{k}:{v}" for k, v in sorted(data['level_counts'].items()) if v > 0])
                            status_parts.append(f"[{service}: {data['status']} {count_str} | {stats_str}]")
                        print("\n─" * 60)
                        print(f"Status: {' '.join(status_parts)}")
                        print("─" * 60 + "\n")
                last_status_update = current_time

            # --- Log Flush Logic (Independent) ---
            if log_buffer and (current_time - last_log_flush >= log_flush_interval):
                log_buffer.flush_to_console(console)
                last_log_flush = current_time
    
    except KeyboardInterrupt:
        print_color("\n🛑 Ctrl+C received. Initiating graceful shutdown...", "yellow")
    except Exception as e:
        print_color(f"💥 Unexpected error: {e}", "red")
    finally:
        if log_buffer:
            log_buffer.flush_to_console(console)
        if logger:
            logging.shutdown()
        graceful_shutdown(processes, timeout=15)

def stream_reader(stream, service_name: str, base_color: str, formatter: Optional[LogFormatter] = None, status_tracker: Optional[ServiceStatusTracker] = None, buffer: Optional[LogBuffer] = None, logger: Optional[logging.Logger] = None, filters: Optional[Dict[str, Any]] = None, search_pattern: str = "", console: Optional[Console] = None):
    """Reads and prints lines from a subprocess's stream using all components."""
    if formatter is None:
        formatter = LogFormatter()

    search_compiled = None
    if search_pattern:
        search_compiled = re.compile(search_pattern)

    # Apply filters
    if filters:
        exclude_patterns = filters.get("exclude_patterns", [])
        include_only_services = filters.get("include_only_services", [])
        if include_only_services and service_name not in include_only_services:
            print_color(f"[FILTER] Logs from {service_name} suppressed by include_only_services filter", "yellow")
            return  # Skip entire service
        exclude_compiled = [re.compile(p) for p in exclude_patterns]

    # Precompiled regex patterns for better performance
    LOG_LEVEL_PATTERNS = {
        'DEBUG': [re.compile(r'\bDEBUG\b', re.IGNORECASE), re.compile(r'\bdebug\b')],
        'INFO': [re.compile(r'\bINFO\b', re.IGNORECASE), re.compile(r'Starting'), re.compile(r'Started')],
        'WARNING': [re.compile(r'\bWARN(ING)?\b', re.IGNORECASE)],
        'ERROR': [re.compile(r'\bERROR\b', re.IGNORECASE), re.compile(r'Failed'), re.compile(r'Exception')],
        'CRITICAL': [re.compile(r'\bCRITICAL\b', re.IGNORECASE), re.compile(r'\bFATAL\b'), re.compile(r'\bcrash\b')]
    }

    # Precompiled format parsers
    FORMAT_PATTERNS = [
        # Format 1: 2025-09-18 15:05:53 - service - LEVEL - message
        re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?) - ([^-]+) - (\w+) - (.+)'),
        # Format 2: [HH:MM:SS] [service] LEVEL: message
        re.compile(r'\[(\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\] \[([^\]]+)\] (\w+):\s*(.+)'),
    ]

    def detect_level(line: str) -> str:
        """Detect log level from line using precompiled patterns."""
        for level, patterns in LOG_LEVEL_PATTERNS.items():
            for pattern in patterns:
                if pattern.search(line):
                    return level
        return 'INFO'  # Default

    def parse_log_line(line: str, service_name: str):
        """Parse log line to extract timestamp, level, and clean message."""
        line = line.strip()
        if not line:
            return None, None, None

        # Try to parse different log formats using precompiled patterns
        for i, pattern in enumerate(FORMAT_PATTERNS):
            match = pattern.match(line)
            if match:
                if i == 0:  # Format 1: 2025-09-18 15:05:53 - service - LEVEL - message
                    date_str, _, level_str, message = match.groups()
                    try:
                        dt = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S.%f')
                        timestamp = dt.strftime('%H:%M:%S.%f')[:-3]
                    except ValueError:
                        dt = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                        timestamp = dt.strftime('%H:%M:%S.000')
                    level = level_str.upper()
                    return timestamp, level, message

                elif i == 1:  # Format 2: [HH:MM:SS] [service] LEVEL: message
                    time_str, _, level_str, message = match.groups()
                    if '.' not in time_str:
                        time_str += '.000'
                    timestamp = time_str
                    level = level_str.upper()
                    return timestamp, level, message

        # Format 3: Other formats, try to extract level and use current time
        level = detect_level(line)
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        return timestamp, level, line
    
    for line in iter(stream.readline, ''):
        if not line:
            break
        line_str = line.strip()
        if not line_str:
            continue

        # Parse the log line
        parsed_timestamp, parsed_level, parsed_message = parse_log_line(line_str, service_name)
        if parsed_timestamp is None:
            continue  # Skip empty or unparseable lines

        # Apply line filters
        if filters and exclude_compiled:
            if any(pat.search(parsed_message) for pat in exclude_compiled):
                continue  # Skip this line

        # Apply search filter
        if search_compiled and not search_compiled.search(parsed_message):
            continue  # Skip if doesn't match search

        if status_tracker:
            status_tracker.update_service_status(service_name, parsed_level, parsed_message)
        if logger:
            logger.log(getattr(logging, parsed_level), parsed_message)
        formatted_texts = formatter.format_message(parsed_timestamp, service_name, parsed_level, parsed_message)

        if buffer:
            buffer.add_message(formatted_texts)
        elif not formatter.no_colors and RICH_AVAILABLE:
            for text in formatted_texts:
                console.print(text)
        else:
            # Fallback plain text (for no_colors or no Rich)
            for text_obj in formatted_texts:
                if isinstance(text_obj, str):
                    print(text_obj)
                else:
                    plain_line = text_obj.plain if hasattr(text_obj, 'plain') else str(text_obj)
                    print(plain_line)
    stream.close()



def _deep_update(source: Dict, overrides: Dict) -> Dict:
    """Recursively update a dictionary."""
    for key, value in overrides.items():
        if isinstance(value, dict) and key in source and isinstance(source[key], dict):
            source[key] = _deep_update(source[key], value)
        else:
            source[key] = value
    return source

def load_logging_config() -> Dict[str, Any]:
    """Load logging configuration from .astra_logging.json with defaults."""
    config_file = ".astra_logging.json"
    default_config = {
        "log_level": "INFO",
        "show_status_bar": True,
        "save_to_file": True,
        "file_path": "logs/astra_{date}.log",
        "rotation": {
            "type": "daily",
            "max_files": 7
        },
        "formatting": {
            "timestamp_format": "%H:%M:%S.%f",
            "service_name_width": 10,
            "compact_mode": False,
            "colors": True
        },
        "filters": {
            "exclude_patterns": ["healthcheck", "ping"],
            "include_only_services": []
        }
    }
    if os.path.exists(config_file):
        try:
            with open(config_file, "r") as f:
                file_config = json.load(f)
                default_config = _deep_update(default_config, file_config)
        except (json.JSONDecodeError, IOError) as e:
            print_color(f"Warning: Could not load .astra_logging.json: {e}", "yellow")
    return default_config

def parse_arguments(logging_config: Dict[str, Any]) -> argparse.Namespace:
    """Parse command-line arguments, overriding config file values."""
    parser = argparse.ArgumentParser(description="Astra Voice Agent CLI")
    parser.add_argument("--log-level", choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
                        default=logging_config["log_level"], help="Set the minimum log level to display")
    parser.add_argument("--no-colors", action="store_true", help="Disable colored output")
    parser.add_argument("--buffer-size", type=int, default=logging_config.get("buffer_size", 100), help="Buffer size for log messages (0 to disable)")
    parser.add_argument("--log-file", default=logging_config.get("file_path", "logs/astra.log"), help="Path to log file")
    parser.add_argument("--log-rotation", default=logging_config.get("rotation", {}).get("type", "daily"), help="Log rotation type (daily or size:NMB)")
    parser.add_argument("--search", type=str, default="", help="Real-time search pattern (regex)")
    args = parser.parse_args()
    # Apply CLI overrides to logging config
    logging_config["log_level"] = args.log_level
    logging_config["no_colors"] = args.no_colors
    logging_config["buffer_size"] = args.buffer_size
    logging_config["log_file"] = args.log_file
    logging_config["log_rotation"] = args.log_rotation
    logging_config["search_pattern"] = args.search
    return args

if __name__ == "__main__":
    logging_config = load_logging_config()
    args = parse_arguments(logging_config)
    try:
        config = get_config()
    except Exception as e:
        config = None
        print_color(f"❌ Failed to load configuration from TOML files: {e}", "red")

    if config:
        # Merge logging config into main config
        for key, value in logging_config.items():
            config.setdefault(key, value)
        run_services(config)
    else:
        print_color("❌ Configuration could not be loaded. Please ensure config/defaults.toml exists.", "red")
        sys.exit(1)
