import json
import os
import subprocess
import sys
import time
import threading
import urllib.request
import urllib.error
import signal
from typing import Dict, Any, List, Optional

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

# ANSI color codes
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

def stream_reader(stream, service_name: str, color: str):
    """Reads and prints lines from a subprocess's stream, highlighting errors."""
    for line in iter(stream.readline, ''):
        line_str = line.strip()
        if "ERROR" in line_str or "Traceback" in line_str or "Warning:" in line_str:
            print_color(f"[{service_name}] {line_str}", "red")
        else:
            print_color(f"[{service_name}] {line_str}", color)
    stream.close()

def load_port_for_service(service_name: str) -> str:
    """Loads the port number from the .port file for a given service."""
    port_file = os.path.join(os.path.dirname(__file__), service_name, ".port")
    try:
        with open(port_file, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "0"

def run_services(config: Dict[str, str]):
    """Launches and manages all microservices as subprocesses."""
    processes = []
    threads = []
    
    print_color("\n--- Launching Services ---", "green")

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
                continue

            command = [venv_python, "-m", "uvicorn", f"{name}.main:app", "--host", "0.0.0.0", "--port", port]
            
            service_env = base_env.copy()
            print_color(f"Starting {name} on port {port}...", properties["color"])
            
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
            processes.append((name, process))

            thread = threading.Thread(target=stream_reader, args=(process.stdout, name, properties["color"]))
            thread.daemon = True
            thread.start()
            threads.append(thread)

        print_color("\n--- All services are running. Waiting 5 seconds for them to initialize... ---", "green")
        time.sleep(5)

        try:
            voice_in_port = load_port_for_service("voice-in")
            if voice_in_port != "0":
                url = f"http://localhost:{voice_in_port}/start"
                print_color(f"Automatically starting microphone by calling {url}...", "cyan")
                req = urllib.request.Request(url, method="POST")
                with urllib.request.urlopen(req, timeout=5) as response:
                    if response.status == 200: print_color("Microphone started successfully.", "cyan")
                    else: print_color(f"Failed to start microphone, status: {response.status}", "red")
        except Exception as e:
            print_color(f"Failed to auto-start microphone: {e}", "red")

        print_color("\n--- System is fully operational. Press Ctrl+C to stop. ---", "green")
        
        while True: time.sleep(1)

    except KeyboardInterrupt:
        print_color("\n--- Ctrl+C received. Initiating shutdown... ---", "yellow")
    
    finally:
        print_color("--- Stopping all services... ---", "yellow")
        for name, process in reversed(processes):
            print_color(f"Stopping {name} (PID: {process.pid})...", "yellow")
            try:
                if sys.platform == "win32":
                    process.send_signal(signal.CTRL_C_EVENT)
                else:
                    process.terminate()
            except Exception as e:
                print_color(f"Error sending signal to {name}: {e}", "red")

        for name, process in reversed(processes):
            try:
                process.wait(timeout=5)
                print_color(f"{name} stopped.", "green")
            except subprocess.TimeoutExpired:
                print_color(f"Killing {name}...", "red")
                process.kill()
        
        print_color("--- Shutdown complete. ---", "green")

def load_personalities() -> List[str]:
    try:
        path = os.path.join(os.path.dirname(__file__), "personalities.json")
        with open(path, "r", encoding="utf-8") as f: return list(json.load(f).keys())
    except Exception as e:
        print(f"Error: Could not load personalities.json: {e}")
        return ["default"]

def select_from_list(question: str, options: List[str]) -> str:
    print(f"\n{question}")
    for i, option in enumerate(options, 1): print(f"  {i}. {option}")
    while True:
        try:
            choice = int(input(f"Enter the number (1-{len(options)}): "))
            if 1 <= choice <= len(options): return options[choice - 1]
            else: print("Invalid number. Please try again.")
        except ValueError: print("Please enter a number.")

def run_configuration_dialog() -> Optional[Dict[str, str]]:
    try:
        print("--- Astra Startup Configuration ---")
        personalities = load_personalities()
        chosen_personality = select_from_list("Select a personality to talk to:", personalities)
        llm_providers = ["openai", "openrouter", "ollama"]
        chosen_llm = select_from_list("Select an LLM provider:", llm_providers)
        tts_providers = ["xtts", "elevenlabs"]
        chosen_tts = select_from_list("Select a TTS provider:", tts_providers)
        stt_providers = ["whisper", "deepgram"]
        chosen_stt = select_from_list("Select an STT provider:", stt_providers)
        print("\n--- Configuration Selected ---")
        print(f"  Personality: {chosen_personality}")
        print(f"  LLM:         {chosen_llm}")
        print(f"  TTS:         {chosen_tts}")
        print(f"  STT:         {chosen_stt}")
        print("----------------------------")

        # Save the chosen personality for other clients to use
        try:
            with open(".astra_personality", "w") as f:
                f.write(chosen_personality)
        except Exception as e:
            print(f"Warning: Could not write to .astra_personality file: {e}")

        return {
            "personality": chosen_personality,
            "llm_provider": chosen_llm,
            "tts_provider": chosen_tts,
            "stt_provider": chosen_stt,
        }
    except KeyboardInterrupt:
        print("\n\nStartup cancelled by user.")
        return None

if __name__ == "__main__":
    CONFIG_FILE = ".astra_last_config.json"
    config = None
    new_config_selected = False

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                loaded_config = json.load(f)
            
            print_color("--- Found Last Configuration ---", "cyan")
            print(f"  1. Personality: {loaded_config.get('personality')}")
            print(f"  2. LLM:         {loaded_config.get('llm_provider')}")
            print(f"  3. TTS:         {loaded_config.get('tts_provider')}")
            print(f"  4. STT:         {loaded_config.get('stt_provider')}")
            print("--------------------------------")

            choice = select_from_list("Select an action:", ["Repeat last launch", "Change parameters"])
            
            if choice == "Repeat last launch":
                config = loaded_config
            else:
                new_config_selected = True

        except Exception as e:
            print_color(f"Could not load {CONFIG_FILE}, running configuration dialog. Error: {e}", "red")
            new_config_selected = True

    if not config or new_config_selected:
        config = run_configuration_dialog()
        if config:
            try:
                with open(CONFIG_FILE, "w") as f:
                    json.dump(config, f, indent=2)
                print_color(f"Configuration saved to {CONFIG_FILE}", "cyan")
            except Exception as e:
                print_color(f"Warning: Could not save configuration to {CONFIG_FILE}. Error: {e}", "red")

    if config:
        run_services(config)