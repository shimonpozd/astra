# Procfile с указанием рабочих директорий для каждого сервиса.

memory: D:\AI\astra\memory\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 7050 --app-dir D:\AI\astra\memory
rag:    D:\AI\astra\rag\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 7060 --app-dir D:\AI\astra\rag
stt:     D:\AI\astra\stt\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 7020 --app-dir D:\AI\astra\stt
brain:  D:\AI\astra\brain\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 7030 --app-dir D:\AI\astra\brain
health: D:\AI\astra\health\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 7099 --app-dir D:\AI\astra\health
voice:  D:\AI\astra\voice-in\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 7010 --app-dir D:\AI\astra\voice-in