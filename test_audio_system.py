#!/usr/bin/env python3
"""
Тест системы аудио сообщений
"""
import asyncio
import httpx
import json

async def test_audio_system():
    """Тестируем систему аудио сообщений"""
    
    print("🎵 Тестирование системы аудио сообщений...")
    
    # Тест 1: Проверка TTS стриминга
    print("\n1. Тестируем TTS стриминг...")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:7010/stream",
                json={
                    "text": "Привет, это тест TTS стриминга!",
                    "language": "ru"
                },
                timeout=30.0
            )
            print(f"✅ TTS стриминг: {response.status_code}")
            if response.status_code == 200:
                print(f"   Размер ответа: {len(response.content)} байт")
            else:
                print(f"   Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ TTS стриминг: {e}")
    
    # Тест 2: Проверка аудио API
    print("\n2. Тестируем аудио API...")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:8000/api/audio/synthesize",
                json={
                    "text": "Привет, это тест аудио сообщения!",
                    "chat_id": "test-chat-123",
                    "voice_id": "yandex-oksana",
                    "language": "ru",
                    "speed": 1.0,
                    "provider": "yandex"
                },
                timeout=30.0
            )
            print(f"✅ Аудио API: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print(f"   ID: {result.get('id')}")
                print(f"   URL: {result.get('audio_url')}")
            else:
                print(f"   Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ Аудио API: {e}")
    
    # Тест 3: Проверка загрузки аудио
    print("\n3. Тестируем загрузку аудио...")
    try:
        async with httpx.AsyncClient() as client:
            # Сначала создаем аудио
            response = await client.post(
                "http://localhost:8000/api/audio/synthesize",
                json={
                    "text": "Тест загрузки аудио",
                    "chat_id": "test-chat-456",
                    "provider": "yandex"
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                audio_url = result.get('audio_url')
                
                # Пытаемся загрузить аудио файл
                if audio_url:
                    audio_response = await client.get(f"http://localhost:8000{audio_url}")
                    print(f"✅ Загрузка аудио: {audio_response.status_code}")
                    if audio_response.status_code == 200:
                        print(f"   Размер файла: {len(audio_response.content)} байт")
                    else:
                        print(f"   Ошибка загрузки: {audio_response.text}")
            else:
                print(f"❌ Не удалось создать аудио: {response.text}")
    except Exception as e:
        print(f"❌ Загрузка аудио: {e}")
    
    print("\n🎉 Тестирование завершено!")

if __name__ == "__main__":
    asyncio.run(test_audio_system())


