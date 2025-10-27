# 🎵 Настройка системы аудио сообщений

## 🚀 Быстрый старт

### 1. Запуск TTS сервиса
```bash
# В корневой директории проекта
./start_tts_service.bat
```

### 2. Запуск Brain сервиса
```bash
# В директории brain_service
cd brain_service
python main.py
```

### 3. Запуск Frontend
```bash
# В директории astra-web-client
cd astra-web-client
npm run dev
```

## 🔧 Проверка работы

### Тест системы
```bash
# Запустить тест
python test_audio_system.py
```

### Ручная проверка API

**TTS стриминг:**
```bash
curl -X POST http://localhost:7010/stream \
  -H "Content-Type: application/json" \
  -d '{"text": "Привет!", "language": "ru"}'
```

**Аудио API:**
```bash
curl -X POST http://localhost:8000/api/audio/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Привет, это тест!",
    "chat_id": "test-123",
    "voice_id": "yandex-oksana",
    "language": "ru",
    "provider": "yandex"
  }'
```

## 🎯 Использование в Frontend

### Простой стриминг
```tsx
import { SimpleStreamingTTS } from '../components/SimpleStreamingTTS';

<SimpleStreamingTTS 
  text="Текст для озвучки"
  language="ru"
  voiceId="yandex-oksana"
/>
```

### Продвинутый стриминг с сохранением
```tsx
import { StreamingAudioMessage } from '../components/StreamingAudioMessage';

<StreamingAudioMessage 
  text="Текст для озвучки"
  chatId="chat-123"
  voiceId="yandex-oksana"
  onAudioSaved={(message) => console.log('Saved:', message)}
/>
```

### Аудио сообщения в чате
```tsx
import { AudioMessageRenderer } from '../components/AudioMessageRenderer';

<AudioMessageRenderer message={audioMessage} />
```

## 🔧 Настройка

### TTS провайдеры
В `config/overrides.toml`:
```toml
[voice.tts]
provider = "yandex"
yandex_voice = "oksana"
yandex_use_v3_rest = true
yandex_folder_id = "your-folder-id"
```

### Yandex настройки
1. Создайте сервисный аккаунт в Yandex Cloud
2. Скачайте `authorized_key.json`
3. Поместите в корень проекта
4. Настройте права: `ai.speechkit-tts.user`

## 📊 Мониторинг

### Логи TTS сервиса
```bash
# Просмотр логов
tail -f logs/tts.log
```

### Логи Brain сервиса
```bash
# Просмотр логов
tail -f brain_service/logs/services.log
```

## 🐛 Устранение проблем

### TTS не работает
1. Проверьте настройки в `config/overrides.toml`
2. Убедитесь, что `authorized_key.json` на месте
3. Проверьте права сервисного аккаунта

### Аудио не воспроизводится
1. Проверьте консоль браузера на ошибки
2. Убедитесь, что TTS сервис запущен на порту 7010
3. Проверьте CORS настройки

### Сообщения не сохраняются
1. Проверьте, что Brain сервис запущен на порту 8000
2. Убедитесь, что Redis доступен
3. Проверьте логи на ошибки

## 🎉 Готово!

Теперь у вас есть полная система аудио сообщений:

✅ **Стриминг TTS** - мгновенное воспроизведение  
✅ **Сохранение аудио** - в истории чата  
✅ **Управление воспроизведением** - пауза, перемотка  
✅ **Скачивание** - аудио файлов  
✅ **Интеграция с чатом** - полная поддержка  

Пользователи получают **лучший опыт** - аудио начинает играть сразу! 🎵⚡


