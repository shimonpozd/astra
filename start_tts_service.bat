@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Change directory to repository root (this script's location)
cd /d "%~dp0"

REM ===== Configuration =====
REM Set TTS provider if not already set (elevenlabs | xtts | orpheus | yandex)
if not defined TTS_PROVIDER set TTS_PROVIDER=yandex
REM Force Yandex REST v3 by default unless explicitly overridden
if not defined YANDEX_USE_V3_REST set YANDEX_USE_V3_REST=true
REM Default location of service account key (optional)
if not defined YANDEX_SA_KEY_PATH set YANDEX_SA_KEY_PATH=authorized_key.json
REM Yandex configuration
if not defined YANDEX_FOLDER_ID set YANDEX_FOLDER_ID=b1gdt4sh9e2clrjj8jcj
if not defined YANDEX_VOICE set YANDEX_VOICE=filipp

REM Prefer project venv python if available
set PYTHON=python
if exist .venv\Scripts\python.exe set PYTHON=.venv\Scripts\python.exe

REM Ensure uvicorn is available in selected interpreter
"%PYTHON%" -c "import uvicorn" 1>nul 2>nul
if errorlevel 1 (
  echo [setup] Installing uvicorn in selected interpreter...
  "%PYTHON%" -m pip install -q uvicorn >nul 2>&1
)
"%PYTHON%" -c "import fastapi" 1>nul 2>nul
if errorlevel 1 (
  echo [setup] Installing fastapi...
  "%PYTHON%" -m pip install -q fastapi >nul 2>&1
)
"%PYTHON%" -c "import pydantic" 1>nul 2>nul
if errorlevel 1 (
  echo [setup] Installing pydantic...
  "%PYTHON%" -m pip install -q pydantic >nul 2>&1
)

REM Ensure minimal runtime deps for TTS are present
"%PYTHON%" -c "import numpy" 1>nul 2>nul
if errorlevel 1 (
  echo [setup] Installing numpy...
  "%PYTHON%" -m pip install -q numpy >nul 2>&1
)
"%PYTHON%" -c "import httpx" 1>nul 2>nul
if errorlevel 1 (
  echo [setup] Installing httpx...
  "%PYTHON%" -m pip install -q httpx >nul 2>&1
)
"%PYTHON%" -c "import requests" 1>nul 2>nul
if errorlevel 1 (
  echo [setup] Installing requests...
  "%PYTHON%" -m pip install -q requests >nul 2>&1
)
"%PYTHON%" -c "import sounddevice" 1>nul 2>nul
if errorlevel 1 (
  echo [setup] Installing sounddevice...
  "%PYTHON%" -m pip install -q sounddevice >nul 2>&1
)

REM If provider is elevenlabs, ensure library exists
if /I "%TTS_PROVIDER%"=="elevenlabs" (
  "%PYTHON%" -c "import elevenlabs" 1>nul 2>nul
  if errorlevel 1 (
    echo [setup] Installing elevenlabs SDK...
    "%PYTHON%" -m pip install -q elevenlabs >nul 2>&1
  )
)

REM ElevenLabs configuration (optional; can also be provided via system env)
REM set ELEVENLABS_API_KEY=YOUR_API_KEY
REM set ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
REM set ELEVENLABS_MODEL_ID=eleven_multilingual_v2
REM set ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128

REM XTTS configuration (optional)
REM set XTTS_API_URL=http://localhost:8010
REM set XTTS_SPEAKER_WAV=speakers/audio.wav

REM Orpheus configuration (optional)
REM set ORPHEUS_API_URL=http://localhost:7041

REM Port used by Brain proxy: services.tts_service_url -> http://localhost:7040
set TTS_PORT=7040

echo Starting TTS service on port %TTS_PORT% (provider: %TTS_PROVIDER%)
if /I "%TTS_PROVIDER%"=="yandex" (
  echo Yandex config: YANDEX_USE_V3_REST=%YANDEX_USE_V3_REST%  YANDEX_SA_KEY_PATH=%YANDEX_SA_KEY_PATH%
)
echo Using Python: %PYTHON%
echo Press Ctrl+C to stop.

REM Run uvicorn with the selected interpreter
"%PYTHON%" -m uvicorn tts.main:app --host 0.0.0.0 --port %TTS_PORT% --log-level info --no-access-log

endlocal

