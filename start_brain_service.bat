@echo off
set ASTRA_CONFIG_ENABLED=true
cd brain_service
python -m uvicorn main:app --host 0.0.0.0 --port 7030
