@echo off
setlocal
set ASTRA_CONFIG_ENABLED=true
cd /d "%~dp0"

set PYTHON_EXE=%~dp0brain_service\.venv\Scripts\python.exe
if not exist "%PYTHON_EXE%" (
  echo [ERROR] Expected virtualenv python not found at "%PYTHON_EXE%".
  echo         Activate the environment manually and reinstall requirements.
  exit /b 1
)

"%PYTHON_EXE%" -m uvicorn brain_service.main:app --host 0.0.0.0 --port 7030
