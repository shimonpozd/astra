import requests
import json
import pyaudio

TTS_URL = "http://localhost:8010"

def play_raw_audio_bytes(audio_bytes: bytes):
    if not audio_bytes:
        print("Ошибка: Получены пустые байты аудио.")
        return
    p = pyaudio.PyAudio()
    try:
        stream = p.open(format=pyaudio.paInt16, channels=1, rate=24000, output=True)
        print(f"Воспроизведение {len(audio_bytes) / 1024:.2f} KB аудио...")
        stream.write(audio_bytes)
        stream.stop_stream()
        stream.close()
        print("Воспроизведение завершено.")
    except Exception as e:
        print(f"Ошибка PyAudio: {e}")
    finally:
        p.terminate()

def test_tts():
    print("Загрузка голоса по умолчанию...")
    with open("default_speaker.json", "r") as f:
        speaker_data = json.load(f)
    
    reply_text = "Если вы слышите эту фразу, значит, тест прошел успешно."
    language = "ru"
    
    # Финальная версия payload
    payload = {
        "text": reply_text,
        "language": language,
        "speaker_embedding": speaker_data["speaker_embedding"],
        "gpt_cond_latent": speaker_data["gpt_cond_latent"],
    }

    print("Отправка запроса в XTTS...")
    try:
        # Отправляем как JSON, а не files
        response = requests.post(f"{TTS_URL}/tts_stream", json=payload, stream=True, timeout=60)
        print(f"Ответ от сервера: {response.status_code}")
        response.raise_for_status()
        
        full_audio = b''
        for chunk in response.iter_content(chunk_size=1024):
            if chunk:
                full_audio += chunk
        
        play_raw_audio_bytes(full_audio)

    except Exception as e:
        print(f"Критическая ошибка: {e}")

if __name__ == "__main__":
    test_tts()