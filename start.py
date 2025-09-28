import json
import os
import subprocess
import sys
import time
import threading
import urllib.request
import urllib.error
import signal
import concurrent.futures
import httpx
from typing import Dict, Any, List, Optional

import textual
from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, Button, Log, Label, Select, Checkbox
from textual.containers import Vertical, Horizontal
from textual.screen import Screen
from textual import events
from textual.message import Message

# --- Service Configuration ---
SERVICES = {
    "voice-in": {"color": "blue"},
    "stt":      {"color": "magenta"},
    "brain":    {"color": "yellow"},
    "tts":      {"color": "cyan"},
    "health":   {"color": "green"},
    "memory":   {"color": "red"},
    "rag":      {"color": "blue"},
}

# ANSI color codes for fallback
COLORS = {
    "red": "\033[91m",
    "green": "\033[92m",
    "yellow": "\033[93m",
    "blue": "\033[94m",
    "magenta": "\033[95m",
    "cyan": "\033[96m",
    "white": "\033[97m",
    "endc": "\033[0m",
}

def print_color(text: str, color: str):
    """Prints text in a given color."""
    color_code = COLORS.get(color.lower(), COLORS["white"])
    print(f"{color_code}{text}{COLORS['endc']}")

def stream_reader(stream, service_name: str, color: str, log_widget):
    """Reads and prints lines from a subprocess's stream, highlighting errors, and posts to Textual log."""
    for line in iter(stream.readline, ''):
        line_str = line.strip()
        if "ERROR" in line_str or "Traceback" in line_str or "Warning:" in line_str:
            print_color(f"[{service_name}] {line_str}", "red")
            if log_widget:
                log_widget.write(f"[{service_name}] [red]{line_str}[/red]")
        else:
            print_color(f"[{service_name}] {line_str}", color)
            if log_widget:
                log_widget.write(f"[{service_name}] {line_str}")
    stream.close()

def load_port_for_service(service_name: str) -> str:
    """Loads the port number from the .port file for a given service."""
    port_file = os.path.join(os.path.dirname(__file__), service_name, ".port")
    try:
        with open(port_file, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "0"

def run_services(config: Dict[str, str], log_widget):
    """Launches and manages all microservices as subprocesses."""
    processes = []
    threads = []
    
    print_color("\n--- Launching Services ---", "green")
    if log_widget:
        log_widget.write("--- Launching Services ---")

    try:
        base_env = os.environ.copy()
        base_env["PYTHONUTF8"] = "1"
        base_env["ASTRA_AGENT_ID"] = config["personality"]
        base_env["ASTRA_LLM_PROVIDER"] = config["llm_provider"]
        base_env["ASTRA_TTS_PROVIDER"] = config["tts_provider"]
        base_env["ASTRA_STT_PROVIDER"] = config["stt_provider"]

        for name, properties in SERVICES.items():
            port = load_port_for_service(name)
            if port == "0": continue

            service_dir = os.path.join(os.path.dirname(__file__), name)
            venv_python = os.path.join(service_dir, ".venv", "Scripts", "python.exe")
            
            if not os.path.exists(venv_python):
                print_color(f"Warning: Python executable not found for '{name}' at {venv_python}. Skipping.", "yellow")
                if log_widget:
                    log_widget.write(f"Warning: Python executable not found for '{name}'")
                continue

            command = [venv_python, "-m", "uvicorn", f"{name}.main:app", "--host", "0.0.0.0", "--port", port]
            
            service_env = base_env.copy()
            print_color(f"Starting {name} on port {port}...", properties["color"])
            if log_widget:
                log_widget.write(f"Starting {name} on port {port}...")
            
            process = subprocess.Popen(
                command,
                cwd=os.path.dirname(__file__),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=service_env,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
            )
            processes.append((name, process, port))

            thread = threading.Thread(target=stream_reader, args=(process.stdout, name, properties["color"], log_widget))
            thread.daemon = True
            thread.start()
            threads.append(thread)

        print_color("\n--- All services are running. Waiting 5 seconds for them to initialize... ---", "green")
        if log_widget:
            log_widget.write("--- All services are running. Waiting 5 seconds for them to initialize... ---")
        time.sleep(5)

        try:
            voice_in_port = load_port_for_service("voice-in")
            if voice_in_port != "0":
                url = f"http://localhost:{voice_in_port}/start"
                print_color(f"Automatically starting microphone by calling {url}...", "cyan")
                if log_widget:
                    log_widget.write(f"Automatically starting microphone by calling {url}...")
                req = urllib.request.Request(url, method="POST")
                with urllib.request.urlopen(req, timeout=5) as response:
                    if response.status == 200: 
                        print_color("Microphone started successfully.", "cyan")
                        if log_widget:
                            log_widget.write("Microphone started successfully.")
                    else: 
                        print_color(f"Failed to start microphone, status: {response.status}", "red")
                        if log_widget:
                            log_widget.write(f"Failed to start microphone, status: {response.status}")
        except Exception as e:
            print_color(f"Failed to auto-start microphone: {e}", "red")
            if log_widget:
                log_widget.write(f"Failed to auto-start microphone: {e}")

        print_color("\n--- System is fully operational. Press Ctrl+C to stop. ---", "green")
        if log_widget:
            log_widget.write("--- System is fully operational. Press Ctrl+C to stop. ---")
        
        while True: time.sleep(1)

    except KeyboardInterrupt:
        print_color("\n--- Ctrl+C received. Initiating shutdown... ---", "yellow")
        if log_widget:
            log_widget.write("--- Ctrl+C received. Initiating shutdown... ---")
    
    finally:
        print_color("--- Stopping all services... ---", "yellow")
        if log_widget:
            log_widget.write("--- Stopping all services... ---")
        
        def shutdown_service(name_port):
            name, process, port = name_port
            port = int(port)
            print_color(f"Stopping {name} (PID: {process.pid}, port: {port})...", "yellow")
            if log_widget:
                log_widget.write(f"Stopping {name} (PID: {process.pid}, port: {port})...")
            
            # Try graceful shutdown via endpoint
            try:
                with httpx.Client(timeout=2.0) as client:
                    response = client.post(f"http://localhost:{port}/shutdown")
                    if response.status_code == 200:
                        print_color(f"{name} shutdown gracefully via endpoint.", "green")
                        if log_widget:
                            log_widget.write(f"{name} shutdown gracefully via endpoint.")
                        return
                    else:
                        print_color(f"{name} shutdown endpoint returned {response.status_code}", "yellow")
                        if log_widget:
                            log_widget.write(f"{name} shutdown endpoint returned {response.status_code}")
            except httpx.RequestError as e:
                print_color(f"{name} shutdown endpoint unavailable: {e}", "yellow")
                if log_widget:
                    log_widget.write(f"{name} shutdown endpoint unavailable: {e}")
            
            # Fallback to signal
            try:
                if sys.platform == "win32":
                    process.send_signal(signal.CTRL_C_EVENT)
                else:
                    process.terminate()
            except Exception as e:
                print_color(f"Error sending signal to {name}: {e}", "red")
                if log_widget:
                    log_widget.write(f"Error sending signal to {name}: {e}")
            
            # Wait with timeout
            try:
                process.wait(timeout=3)
                print_color(f"{name} stopped.", "green")
                if log_widget:
                    log_widget.write(f"{name} stopped.")
            except subprocess.TimeoutExpired:
                print_color(f"Killing {name}...", "red")
                if log_widget:
                    log_widget.write(f"Killing {name}...")
                process.kill()
        
        # Parallel shutdown
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(processes)) as executor:
            futures = [executor.submit(shutdown_service, (name, process, port)) 
                       for name, process, port in reversed(processes)]
            concurrent.futures.wait(futures, timeout=5)  # Overall timeout 5s
        
        print_color("--- Shutdown complete. ---", "green")
        if log_widget:
            log_widget.write("--- Shutdown complete. ---")

class ConfigScreen(Screen):
    DEFAULT_CONFIG = {
        "personality": "chevruta_study_bimodal",
        "llm_provider": "openrouter",
        "tts_provider": "xtts",
        "stt_provider": "whisper",
    }

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Label("Astra Startup Configuration", id="title")
        yield Vertical(
            Label("Select Personality:"),
            Select([
                ("default", "default"),
                ("rabbi", "rabbi"),
                ("jarvis", "jarvis"),
                ("eva", "eva"),
                ("chevruta_study_bimodal", "chevruta_study_bimodal"),
            ], id="personality"),
            Label("Select LLM Provider:"),
            Select([
                ("openai", "openai"),
                ("openrouter", "openrouter"),
                ("ollama", "ollama"),
            ], id="llm"),
            Label("Select TTS Provider:"),
            Select([
                ("xtts", "xtts"),
                ("elevenlabs", "elevenlabs"),
            ], id="tts"),
            Label("Select STT Provider:"),
            Select([
                ("whisper", "whisper"),
                ("deepgram", "deepgram"),
            ], id="stt"),
            Button("Launch Services", id="launch", variant="primary"),
            Button("Quit", id="quit", variant="error"),
            id="config_container",
        )
        yield Footer()

    def on_select_changed(self, event: Select.Changed) -> None:
        print(f"DEBUG: Selected {event.widget.id}: {event.value}")  # Log for debugging
        self.notify(f"Selected {event.widget.id}: {event.value}")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        print(f"DEBUG: Button pressed: {event.button.id}")  # Log for debugging
        if event.button.id == "launch":
            personality = self.query_one("#personality", Select).value
            llm = self.query_one("#llm", Select).value
            tts = self.query_one("#tts", Select).value
            stt = self.query_one("#stt", Select).value
            config = {
                "personality": personality,
                "llm_provider": llm,
                "tts_provider": tts,
                "stt_provider": stt,
            }
            print(f"DEBUG: Launching with config: {config}")  # Log config
            self.app.push_screen(LogScreen(config))
        elif event.button.id == "quit":
            self.app.exit()

class LogScreen(Screen):
    def __init__(self, config: Dict[str, str]):
        super().__init__()
        self.config = config

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Container(
            Log(id="log"),
            id="log_container",
            classes="log-container"
        )
        yield Horizontal(
            Button("Stop All", id="stop", variant="error"),
            Button("Restart Service", id="restart"),
            id="controls",
        )
        yield Footer()

    def on_mount(self) -> None:
        self.title = "Astra Services - Logs"
        # Add CSS for sizing
        self.stylesheet = """
        .log-container {
            height: 1fr;
        }
        #log {
            height: 100%;
        }
        """
        log = self.query_one(Log)
        log.write("Launching services with config:")
        log.write(f"Personality: {self.config['personality']}")
        log.write(f"LLM: {self.config['llm_provider']}")
        log.write(f"TTS: {self.config['tts_provider']}")
        log.write(f"STT: {self.config['stt_provider']}")
        log.write("---")
        # Launch in background
        threading.Thread(target=run_services, args=(self.config, self.query_one(Log)), daemon=True).start()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        print(f"DEBUG: LogScreen button pressed: {event.button.id}")  # Log for debugging
        if event.button.id == "stop":
            self.app.exit()
        elif event.button.id == "restart":
            self.notify("Restart functionality to be implemented")

class AstraApp(App):
    def compose(self) -> ComposeResult:
        yield ConfigScreen()

    def on_mount(self) -> None:
        self.title = "Astra Startup Dashboard"

if __name__ == "__main__":
    app = AstraApp()
    app.run()