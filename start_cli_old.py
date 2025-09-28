import json
import os
import subprocess
import sys
import time
import threading
import urllib.request
import urllib.error
import signal
import socket
import concurrent.futures
from typing import Dict, Any, List, Optional
from datetime import datetime

# Rich and colorama for better terminal output
try:
    import rich
    from rich.console import Console
    from rich.text import Text
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
  #  "rag":      {"color": "blue", "optional": False},
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

def get_log_level_color(line: str, base_color: str) -> str:
    """Determine rich style based on log level."""
    line_upper = line.upper()
    if "ERROR" in line_upper or "TRACEBACK" in line_upper or "CRITICAL" in line_upper or "FATAL" in line_upper:
        return "red"
    return base_color

def stream_reader(stream, service_name: str, base_color: str):
    """Reads and prints lines from a subprocess's stream."""
    console = Console()
    for line in iter(stream.readline, ''):
        if not line:
            break
        line_str = line.strip()
        if not line_str:
            continue
        
        log_style = get_log_level_color(line_str, base_color)
        
        text = Text()
        timestamp = datetime.now().strftime("%H:%M:%S")
        text.append(f"[{timestamp}] ", style="white")
        service_tag = f"[{service_name:>8}]"
        text.append(service_tag, style=f"bold {base_color}")
        text.append(" ", style="white")
        text.append(line_str, style=log_style)
        
        if RICH_AVAILABLE:
            console.print(text)
        else:
            print(f"[{timestamp}] [{service_name}] {line_str}")
    stream.close()

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
                    # Send CTRL_C_EVENT to the process group
                    os.kill(process.pid, signal.CTRL_C_EVENT)
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

def run_services(config: Dict[str, Any]):
    """Service management with error handling and monitoring."""
    processes = []
    threads = []
    enabled_services = config.get("enabled_services", {})

    print_color("\n=== Astra Voice Agent Starting ===", "bold")
    print_color(f"Personality: {config.get('personality', 'N/A')}", "cyan")
    print_color("\n--- Launching Services ---", "green")

    try:
        base_env = os.environ.copy()
        base_env.update({
            "PYTHONUTF8": "1",
            "ASTRA_AGENT_ID": config.get("personality", "default"),
            "ASTRA_LLM_PROVIDER": config.get("llm_provider", "openai"),
            "ASTRA_TTS_PROVIDER": config.get("tts_provider", "xtts"),
            "ASTRA_STT_PROVIDER": config.get("stt_provider", "whisper"),
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
            venv_python = os.path.join(service_dir, ".venv", "Scripts", "python.exe")
            if not os.path.exists(venv_python):
                print_color(f"Warning: Python executable not found for '{name}' at {venv_python}. Skipping.", "yellow")
                continue

            command = [venv_python, "-m", "uvicorn", f"{name}.main:app", "--host", "0.0.0.0", "--port", port]
            if name == "brain":
                command.extend(["--timeout-keep-alive", "600"])

            try:
                print_color(f"Starting {name} on port {port}...", properties["color"])
                
                # Process creation flags for proper signal handling
                creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
                preexec_fn = os.setsid if sys.platform != "win32" else None

                process = subprocess.Popen(
                    command,
                    cwd=os.path.dirname(__file__),
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
                thread = threading.Thread(target=stream_reader, args=(process.stdout, name, properties["color"] ), daemon=True)
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

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print_color("\n🛑 Ctrl+C received. Initiating graceful shutdown...", "yellow")
    except Exception as e:
        print_color(f"💥 Unexpected error: {e}", "red")
    finally:
        graceful_shutdown(processes, timeout=15)

def load_last_config() -> Optional[Dict[str, Any]]:
    """Load last used configuration."""
    config_file = ".astra_last_config.json"
    if os.path.exists(config_file):
        try:
            with open(config_file, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print_color(f"Could not load or parse last config: {e}", "yellow")
    return None

if __name__ == "__main__":
    config = load_last_config()

    if config:
        run_services(config)
    else:
        print_color("❌ Configuration file (.astra_last_config.json) not found.", "red")
        print_color("Please run the launcher.py to configure your session first.", "yellow")
        sys.exit(1)