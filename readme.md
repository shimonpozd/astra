# Astra Voice Agent

## Logging System Improvements

The `start_cli.py` has been significantly enhanced with a comprehensive logging system following the technical specification. All stages have been implemented: Minimum (basic formatting and colors), Extended (status tracking, filtering, buffering), and Advanced (file logging, configuration, search, statistics).

### Key Features

#### Visual Enhancements
- **Structured Output**: Logs follow the format `[HH:MM:SS.mmm] [SERVICE] [LEVEL] │ MESSAGE` with proper multiline handling using │, ├─, └─ symbols.
- **Color Scheme**:
  - Timestamp: dim white
  - Service name: Unique color per service from `SERVICES` config
  - Levels: DEBUG (dim gray), INFO (green), WARNING (yellow), ERROR (red), CRITICAL (bold red)
- **Fixed-Width Columns**: Aligned columns for readability (timestamp: 13 chars, service: 10 chars, level: 8 chars).

#### Functional Requirements
- **Multiline Support**: Automatic detection and formatting of multi-line messages with proper indentation and continuation symbols.
- **Log Level Filtering**: Use `--log-level [DEBUG|INFO|WARNING|ERROR|CRITICAL]` to filter output (default: INFO).
- **Buffering**: `LogBuffer` prevents output mixing from multiple services with thread-safe deque (default size: 100, configurable via `--buffer-size` or config).
- **Service Status Header**: Real-time status bar showing service health (✓, ⚠, ✗) and message counts, updated every 10 seconds.

#### Advanced Features
- **File Logging with Rotation**:
  - `--log-file logs/astra.log` to save logs to file
  - `--log-rotation [daily|size:10MB]` for automatic rotation (7 backups)
  - Uses `TimedRotatingFileHandler` for daily or `RotatingFileHandler` for size-based.
- **Configuration File**: `.astra_logging.json` for persistent settings (loaded and merged with CLI args):
  ```json
  {
    "log_level": "INFO",
    "show_status_bar": true,
    "save_to_file": true,
    "file_path": "logs/astra_{date}.log",
    "rotation": {"type": "daily", "max_files": 7},
    "formatting": {
      "timestamp_format": "%H:%M:%S.%f",
      "service_name_width": 10,
      "compact_mode": false,
      "colors": true
    },
    "filters": {
      "exclude_patterns": ["healthcheck", "ping"],
      "include_only_services": []
    }
  }
  ```
- **Compact Mode**: `--compact-mode` or config `"compact_mode": true` for simplified output without colors, symbols, or wrapping: `HH:MM:SS service │ LEVEL message`.
- **Filters**: Config-based exclusion (`exclude_patterns`) and inclusion (`include_only_services`) using regex, applied in real-time.
- **Real-Time Search**: `--search "pattern"` for regex-based line filtering.
- **Statistics**: Status bar includes per-service level counts (e.g., `[brain: ✓ 1.2k msg | INFO:1000 ERROR:5]`).

### Usage Examples

1. **Basic Run with Default Logging**:
   ```
   python start_cli.py
   ```

2. **Debug Mode with File Logging and Rotation**:
   ```
   python start_cli.py --log-level DEBUG --log-file logs/debug.log --log-rotation size:10MB
   ```

3. **Compact Mode, No Colors, Search for Errors**:
   ```
   python start_cli.py --compact-mode --no-colors --search "error|failed"
   ```

4. **Custom Buffer and Filters via Config**:
   Edit `.astra_logging.json` to set `"compact_mode": true`, `"exclude_patterns": ["debug"]`, then run:
   ```
   python start_cli.py --buffer-size 50
   ```

### Testing and Verification
The system has been tested across all stages:
- **Minimum**: Verified formatting, colors, and multiline handling.
- **Extended**: Confirmed status tracking, level filtering, and buffering prevent mixing.
- **Advanced**: Tested file rotation, config loading, compact mode, filters, search, and statistics display.

All features work as specified without breaking existing functionality. The logging system is now production-ready for the Astra Voice Agent.

Astra is a modular voice-enabled AI assistant with microservices for speech-to-text (STT), text-to-speech (TTS), brain (LLM), memory, RAG, health monitoring, and voice input. Supports multiple personalities (e.g., rabbi, jarvis, chevruta) and providers (OpenAI, OpenRouter, XTTS, Whisper).

## Architecture Overview

- **CLI Startup (start_cli.py)**: Reliable console-based configuration and service launcher. Loads personalities from `personalities.json`, prompts for selections (personality, LLM/TTS/STT providers), saves config to `.astra_last_config.json` for reuse. Launches services as subprocesses with enhanced logging, health checks, and graceful shutdown. Auto-starts microphone if voice-in service is available.

- **Advanced Monitor (astra_supervisor.py)**: Textual-based TUI for real-time service management and monitoring. Features:
  - Start/stop/restart individual or all services.
  - Live log viewing with filtering (service, log level, regex), color-coding (errors red, warnings yellow).
  - Metrics table (CPU%, RAM MB, PID, uptime) using psutil, updates every 2s.
  - Keyboard shortcuts (s: start all, x: stop all, r: restart, q: quit, f: follow logs).
  - Logs saved to `logs/{service}.log`.

- **Launcher (launcher.py)**: Entry point menu to choose mode:
  - Console Mode: Run start_cli.py for quick startup.
  - Advanced Monitor: Run astra_supervisor.py for monitoring (requires textual/psutil).
  - Exit.

Services use ports from `{service}/.port` files (e.g., voice-in:7010, brain:7030). Each service runs in its own `.venv` with uvicorn/FastAPI.

## Setup

1. **Virtual Environment**:
   ```
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   source .venv/bin/activate  # Unix
   ```

2. **Install Dependencies**:
   ```
   pip install -r requirements.txt
   ```
   - Core: requests, httpx, rich, textual, psutil.
   - Optional: For services (install in each `{service}/.venv` via their requirements.txt).

3. **Service Setup**:
   - Ensure each service directory (`voice-in/`, `stt/`, etc.) has `.venv`, `main.py` (FastAPI app), and `.port` file with unique port.
   - Run `setup/download_models.py` if needed for models.

4. **Personalities**:
   - Edit `personalities.json` for custom system prompts, languages, tool configs (e.g., use_sefaria_tools, mem0_collection).

## Usage

### Quick Start (CLI Mode)
```
python launcher.py
```
- Select "Console Mode".
- Choose personality/providers (or reuse last config from `.astra_last_config.json`).
- Services launch with colored logs, health checks (waits up to 20s for critical services like brain/health).
- Press Ctrl+C for graceful shutdown (SIGTERM, timeout 15s, then kill).
- Output: "ASTRA VOICE AGENT IS READY" when operational.

### Advanced Monitoring
```
python launcher.py
```
- Select "Advanced Monitor" (falls back to console if textual/psutil missing).
- TUI opens: Toolbar for controls/filtering, log pane (1fr height), metrics table (bottom 12 lines).
- Logs stream in real-time; filter by service/level/regex (Enter to apply).
- Metrics: CPU/RAM per service, auto-refresh 2s.
- Controls: Buttons for start/stop/restart/clear; checkboxes for stderr-only/follow.
- Quit: 'q' or close window.

### Direct Runs
- CLI: `python start_cli.py` (interactive config every time).
- Monitor: `python astra_supervisor.py` (auto-starts all services).

## Services

| Service   | Port (default) | Description                  | Critical |
|-----------|----------------|------------------------------|----------|
| voice-in | 7010          | Voice input/mic handling    | No      |
| stt      | 7020          | Speech-to-text (Whisper)    | Yes     |
| brain    | 7030          | LLM core (OpenRouter/Ollama)| Yes     |
| tts      | 7040          | Text-to-speech (XTTS)       | No      |
| health   | ?             | System health endpoints     | Yes     |
| memory   | ?             | Long-term memory (Mem0)     | No      |
| rag      | ?             | Retrieval-Augmented Gen     | No      |

- Health checks: `/health` or `/` endpoint (3s timeout).
- Env vars: Set via config (ASTRA_AGENT_ID=personality, ASTRA_LLM_PROVIDER, etc.).
- Logs: Console (colored) + files in `logs/` for monitor.

## Configuration Persistence

- `.astra_last_config.json`: Saves/reuses personality/providers.
- `.astra_personality`: Quick-load for services.
- Edit `.env` for API keys (e.g., OPENROUTER_API_KEY).

## Troubleshooting

- **Services Skip**: Check `.port` files exist/unique; ensure `{service}/.venv/Scripts/python.exe` and uvicorn installed.
- **TUI Garbled**: Use Windows Terminal/PowerShell; install textual: `pip install textual`.
- **Health Timeout**: Increase wait in start_cli.py; check service logs for errors.
- **No Microphone**: Verify voice-in port/POST to `/start`; Windows audio permissions.
- **Memory High**: Monitor via supervisor; services use separate venvs.

## Development

- Add services: Update SERVICES dict in start_cli.py/supervisor.py, create dir with main.py/.port.
- Custom Personalities: Add to `personalities.json` (system_prompt, language, tools).
- Testing: Run individual services: `cd {service} && .venv\Scripts\activate && python -m uvicorn main:app --reload`.
- Metrics: psutil for CPU/RAM; extend supervisor for custom endpoints.

## Files

- `start_cli.py`: CLI launcher (enhanced from original start.py).
- `astra_supervisor.py`: TUI monitor with logs/metrics.
- `launcher.py`: Mode selector.
- `personalities.json`: Agent configs.
- `requirements.txt`: Core deps (textual, psutil, rich, httpx).
- `logs/`: Service log files.
- `{service}/`: Microservices (main.py, requirements.txt, .venv, .port).

For contributions: Focus on modularity, error handling, Windows compatibility.
