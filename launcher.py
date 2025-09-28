import sys
import os
import subprocess
import json
from typing import Optional, Dict, Any, List
import httpx

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

# --- Service Configuration (from start_cli.py) ---
SERVICES = {
    "voice-in": {"color": "blue", "optional": True},
    "stt":      {"color": "magenta", "optional": True},
    "brain":    {"color": "yellow", "optional": False},
    "tts":      {"color": "cyan", "optional": True},
    "health":   {"color": "green", "optional": False},
    "memory":   {"color": "red", "optional": False},
    "rag":      {"color": "blue", "optional": False},
}

BRAIN_URL = "http://localhost:7030"

def print_color(text: str, color: str, timestamp: bool = False):
    """Prints text in a given color using rich if available."""
    if RICH_AVAILABLE:
        console = Console()
        try:
            console.print(text, style=color.lower())
        except Exception:
            print(text)
    else:
        print(text)

def print_banner():
    """Display launcher banner."""
    banner = """
    ╔═══════════════════════════════════════════╗
    ║            ASTRA LAUNCHER                 ║
    ║    First, configure your agent session    ║
    ╚═══════════════════════════════════════════╝
    """
    print_color(banner, "cyan")

# --- Configuration functions (from start_cli.py) ---

def load_personalities() -> List[str]:
    """Load available personalities from config file."""
    try:
        path = os.path.join(os.path.dirname(__file__), "personalities.json")
        with open(path, "r", encoding="utf-8") as f:
            return list(json.load(f).keys())
    except Exception as e:
        print_color(f"Error loading personalities.json: {e}", "red")
        return ["default"]

def select_from_list(question: str, options: List[str], prompt: str = "Enter choice") -> str:
    """Interactive selection from a list of options."""
    print_color(f"\n{question}", "cyan")
    for i, option in enumerate(options, 1):
        print(f"  {i}. {option}")

    while True:
        try:
            choice = input(f"{prompt} (1-{len(options)}): ").strip()
            if choice and 1 <= int(choice) <= len(options):
                return options[int(choice) - 1]
            else:
                print_color("Invalid number.", "red")
        except (ValueError, IndexError):
            print_color("Please enter a valid number.", "red")
        except KeyboardInterrupt:
            print_color("\nOperation cancelled.", "yellow")
            sys.exit(0)

def select_services_dialog(current_config: Dict[str, bool]) -> Dict[str, bool]:
    """Dialog to select which optional services to run."""
    options = [
        "Full (Voice, STT, TTS)",
        "Text Only (No Voice, STT, TTS)",
        "Custom",
        "None (Core services only)"
    ]
    choice = select_from_list("Select service preset:", options)

    if choice == "Full (Voice, STT, TTS)":
        return {"voice-in": True, "stt": True, "tts": True}
    elif choice == "Text Only (No Voice, STT, TTS)":
        return {"voice-in": False, "stt": False, "tts": False}
    elif choice == "None (Core services only)":
        return {name: False for name, props in SERVICES.items() if props.get("optional")}

    selections = current_config.copy()
    for name, props in SERVICES.items():
        if not props.get("optional"):
            continue

        is_enabled = selections.get(name, False)
        prompt = f"Enable {name}? (Currently {'ON' if is_enabled else 'OFF'}) [Y/n]: "
        user_input = input(prompt).strip().lower()

        if user_input == 'n':
            selections[name] = False
        elif user_input == 'y' or user_input == '':
            selections[name] = True

    return selections

def run_configuration_dialog(last_config: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Interactive configuration dialog."""
    try:
        print_color("\n🚀 Astra Voice Agent Configuration", "bold")

        personalities = load_personalities()
        chosen_personality = select_from_list("Select personality:", personalities)

        llm_providers = ["openai", "openrouter", "ollama"]
        chosen_llm = select_from_list("Select LLM provider:", llm_providers)

        # Safely access nested keys
        service_defaults = {name: True for name, props in SERVICES.items() if props.get("optional")}
        last_services = last_config.get("launcher", {}).get("enabled_services", service_defaults) if last_config else service_defaults

        enabled_services = select_services_dialog(last_services)

        chosen_tts = "none"
        if enabled_services.get("tts"):
            tts_providers = ["xtts", "elevenlabs"]
            chosen_tts = select_from_list("Select TTS provider:", tts_providers)

        chosen_stt = "none"
        if enabled_services.get("stt"):
            stt_providers = ["whisper", "deepgram"]
            chosen_stt = select_from_list("Select STT provider:", stt_providers)

        # Construct the config with the new nested structure
        config = {
            "personalities": {"default": chosen_personality},
            "llm": {"provider": chosen_llm},
            "voice": {
                "tts": {"provider": chosen_tts},
                "stt": {"provider": chosen_stt}
            },
            "launcher": {"enabled_services": enabled_services}
        }

        print_color("\n✅ Configuration Summary", "green")
        print_color(f"  Personality: {chosen_personality}", "white")
        print_color(f"  LLM Provider: {chosen_llm}", "white")
        print_color(f"  TTS Provider: {chosen_tts}", "white")
        print_color(f"  STT Provider: {chosen_stt}", "white")
        print_color("Enabled Services:", "white")
        for s_name, s_enabled in enabled_services.items():
            print_color(f"    - {s_name}: {'ON' if s_enabled else 'OFF'}", "white")

        return config

    except KeyboardInterrupt:
        print_color("\n\nConfiguration cancelled.", "yellow")
        return None

def load_last_config() -> Optional[Dict[str, Any]]:
    """Load last used configuration from the brain service."""
    try:
        response = httpx.get(f"{BRAIN_URL}/admin/config", timeout=5)
        response.raise_for_status()
        return response.json()
    except httpx.RequestError as e:
        print_color(f"Could not connect to brain service at {BRAIN_URL} to load config.", "red")
        print_color("Please ensure the brain service is running before using the launcher.", "yellow")
        return None
    except httpx.HTTPStatusError as e:
        print_color(f"Error loading config from brain service: {e.response.status_code} {e.response.text}", "red")
        return None

def save_config(config: Dict[str, Any]):
    """Save configuration to the brain service via PATCH request."""
    try:
        response = httpx.patch(f"{BRAIN_URL}/admin/config", json=config, timeout=10)
        response.raise_for_status()
        print_color(f"\n✅ Configuration saved successfully via API", "green")
    except httpx.RequestError as e:
        print_color(f"Could not connect to brain service at {BRAIN_URL} to save config.", "red")
    except httpx.HTTPStatusError as e:
        print_color(f"Error saving config via API: {e.response.status_code} {e.response.text}", "red")


# --- Launcher functions ---

def check_dependencies() -> bool:
    """Check if required dependencies are installed for monitor mode."""
    try:
        import textual
        import psutil
        return True
    except ImportError as e:
        print(f"⚠️  Missing dependencies for advanced monitor: {e}")
        print("Install with: pip install -r requirements.txt (includes textual psutil)")
        return False

def run_console_mode():
    """Run in traditional console mode using start_cli.py."""
    print_color("🖥️  Starting in console mode...", "bold cyan")
    try:
        # We now assume start_cli.py will just run with the saved config
        result = subprocess.run([sys.executable, "start_cli.py"], check=False)
        return result.returncode
    except FileNotFoundError:
        print_color("❌ start_cli.py not found in current directory", "red")
        return 1
    except KeyboardInterrupt:
        print_color("\n👋 Console mode interrupted", "yellow")
        return 0

def run_monitor_mode():
    """Run with advanced Textual UI monitoring using astra_supervisor.py."""
    if not check_dependencies():
        print_color("\n🔄 Falling back to console mode...", "yellow")
        return run_console_mode()

    print_color("📊 Starting advanced monitoring interface...", "bold cyan")
    try:
        result = subprocess.run([sys.executable, "astra_supervisor.py"], check=False)
        return result.returncode
    except FileNotFoundError:
        print_color("❌ astra_supervisor.py not found in current directory", "red")
        return 1
    except KeyboardInterrupt:
        print_color("\n👋 Monitor mode interrupted", "yellow")
        return 0
    except Exception as e:
        print_color(f"❌ Error starting monitor: {e}", "red")
        print_color("🔄 Falling back to console mode...", "yellow")
        return run_console_mode()

def show_menu() -> Optional[str]:
    """Show selection menu and get user choice."""
    monitor_available = check_dependencies()

    print_color("\n📋 Available modes:", "cyan")
    print("  1. Console Mode (classic log stream)")
    if monitor_available:
        print("  2. Advanced Monitor (TUI with logs & metrics)")
        print("  3. Exit")
        max_choice = 3
    else:
        print("  2. Exit")
        max_choice = 2

    while True:
        try:
            choice = input(f"\n🎯 Select mode (1-{max_choice}): ").strip()

            if choice == "1":
                return "console"
            elif choice == "2" and monitor_available:
                return "monitor"
            elif choice == str(max_choice):
                return "exit"
            elif choice == "2" and not monitor_available:
                return "exit"
            else:
                print_color("❌ Invalid choice. Please try again.", "red")

        except KeyboardInterrupt:
            print_color("\n👋 Goodbye!", "yellow")
            return "exit"
        except EOFError:
            return "exit"


def main():
    """Main launcher function."""
    print_banner()

    if not os.path.exists("start_cli.py") or not os.path.exists("astra_supervisor.py"):
        print_color("❌ Error: Required files (start_cli.py, astra_supervisor.py) not found.", "red")
        print("Please run this launcher from the Astra root directory.")
        return 1

    config: Optional[Dict[str, Any]] = None
    last_config = load_last_config()

    if last_config:
        print_color("📁 Found Previous Configuration via API", "cyan")
        # Simplified display of nested config
        print(f"  - Personality: {last_config.get('personalities', {}).get('default')}")
        print(f"  - LLM Provider: {last_config.get('llm', {}).get('provider')}")
        
        choice = select_from_list("Action:", ["Use previous configuration", "Change configuration", "Exit"])

        if choice == "Use previous configuration":
            config = last_config
        elif choice == "Change configuration":
            config = run_configuration_dialog(last_config)
            if config:
                save_config(config)
        else:
            sys.exit(0)
    else:
        # Handle case where brain is not running or no config exists
        print_color("Could not load existing config. Starting fresh configuration...", "yellow")
        config = run_configuration_dialog(None)
        if config:
            save_config(config)

    if not config:
        print_color("No configuration provided. Exiting.", "yellow")
        return 1

    # --- Mode Selection ---
    mode_choice = show_menu()

    if mode_choice == "console":
        return run_console_mode()
    elif mode_choice == "monitor":
        return run_monitor_mode()
    elif mode_choice == "exit":
        print_color("👋 Goodbye!", "yellow")
        return 0
    else:
        print_color("❌ Invalid choice", "red")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print_color("\n👋 Launcher interrupted", "yellow")
        sys.exit(0)
    except Exception as e:
        print_color(f"💥 Unexpected error: {e}", "red")
        sys.exit(1)
