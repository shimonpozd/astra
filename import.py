import requests

url = "http://localhost:8010/tts_to_audio/"
payload = {
    "text": "Проверка XTTS",
    "language": "ru",
    "speaker_wav": "speakers/speaker.wav"
}
r = requests.post(url, json=payload, timeout=120)
print(r.status_code, r.headers.get("content-type"), len(r.content))
open("out.wav", "wb").write(r.content)