# services/memory/Dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# The entrypoint will be a shell script that starts the API and the worker
CMD ["python", "app/main.py"]
