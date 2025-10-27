# 🎵 Audio Messages Implementation

Система аудио сообщений в чате позволяет сохранять TTS аудио как сообщения, которые можно переслушивать, скачивать и управлять.

## 🚀 Возможности

✅ **Сохранение аудио** - TTS аудио сохраняется как сообщения в чате  
✅ **Переслушивание** - можно воспроизводить аудио многократно  
✅ **Скачивание** - можно скачать аудио файлы  
✅ **Прогресс бар** - видно прогресс воспроизведения  
✅ **Управление** - пауза, перемотка, остановка  
✅ **История чата** - аудио сохраняется в истории  
✅ **Поддержка провайдеров** - Yandex, ElevenLabs, XTTS, Orpheus  

## 📁 Структура файлов

### Frontend (astra-web-client/src/)

**Типы:**
- `types/text.ts` - типы `AudioMessage`, `AudioContent`

**Компоненты:**
- `components/AudioMessageRenderer.tsx` - плеер для аудио сообщений
- `components/ui/AudioTTSButton.tsx` - кнопка генерации аудио
- `components/UnifiedMessageRenderer.tsx` - обновлен для поддержки аудио
- `components/chat/ChatViewport.tsx` - поддержка аудио сообщений

**Сервисы:**
- `services/ttsService.ts` - обновлен для создания аудио сообщений
- `hooks/useAudioTTS.ts` - хук для работы с аудио TTS

### Backend (brain_service/)

**API:**
- `api/audio.py` - API для работы с аудио файлами
- `main.py` - добавлен роутер для аудио API

## 🎯 Использование

### 1. Создание аудио сообщения

```typescript
import { useAudioTTS } from '../hooks/useAudioTTS';

const { generateAudioMessage, saveAudioMessage } = useAudioTTS({
  voiceId: 'yandex-oksana',
  language: 'ru',
  speed: 1.0,
});

// Генерируем аудио сообщение
const audioMessage = await generateAudioMessage("Привет, как дела?");

// Сохраняем в чат
await saveAudioMessage(audioMessage, chatId);
```

### 2. Использование кнопки аудио TTS

```tsx
import { AudioTTSButton } from '../components/ui/AudioTTSButton';

<AudioTTSButton
  text="Текст для озвучки"
  chatId="chat-123"
  voiceId="yandex-oksana"
  language="ru"
  onAudioGenerated={(message) => console.log('Audio generated:', message)}
  onAudioSaved={(message) => console.log('Audio saved:', message)}
/>
```

### 3. Рендеринг аудио сообщений

```tsx
import { AudioMessageRenderer } from '../components/AudioMessageRenderer';

<AudioMessageRenderer message={audioMessage} />
```

## 🔧 API Endpoints

### Backend API

**POST `/api/audio/synthesize`** - Синтез аудио из текста
```json
{
  "text": "Текст для озвучки",
  "chat_id": "chat-123",
  "voice_id": "yandex-oksana",
  "language": "ru",
  "speed": 1.0,
  "provider": "yandex"
}
```

**GET `/api/audio/{chat_id}/{filename}`** - Получение аудио файла

**POST `/api/audio/upload`** - Загрузка аудио файла

**DELETE `/api/audio/{chat_id}/{filename}`** - Удаление аудио файла

**GET `/api/audio/{chat_id}/list`** - Список аудио файлов чата

## 📊 Типы данных

### AudioMessage
```typescript
interface AudioMessage {
  id: string;
  role: 'assistant';
  content_type: 'audio.v1';
  content: AudioContent;
  timestamp: number;
}
```

### AudioContent
```typescript
interface AudioContent {
  text: string;           // Исходный текст
  audioUrl: string;       // URL аудио файла
  duration?: number;      // Длительность в секундах
  provider: string;       // yandex, elevenlabs, etc.
  voiceId?: string;       // ID голоса
  format?: string;        // mp3, ogg, wav
  size?: number;          // Размер файла в байтах
}
```

## 🎨 UI Компоненты

### AudioMessageRenderer
- **Плеер** с кнопками воспроизведения/паузы
- **Прогресс бар** с возможностью перемотки
- **Информация** о провайдере, голосе, длительности
- **Кнопка скачивания** аудио файла
- **Временные метки** текущего времени и общей длительности

### AudioTTSButton
- **Генерация аудио** из текста
- **Сохранение** в чат
- **Состояния** загрузки, успеха, ошибки
- **Настройки** голоса, языка, скорости

## 🔄 Поток данных

1. **Пользователь** нажимает кнопку "Озвучить"
2. **Frontend** вызывает `generateAudioMessage()`
3. **TTSService** синтезирует аудио через TTS API
4. **AudioBuffer** конвертируется в Blob и создается URL
5. **AudioMessage** создается с метаданными
6. **Backend API** сохраняет аудио файл на сервере
7. **Chat** получает новое аудио сообщение
8. **UI** отображает плеер для воспроизведения

## 🛠️ Настройка

### Frontend
```typescript
// В config/overrides.toml
[voice.tts]
provider = "yandex"
yandex_voice = "oksana"
yandex_use_v3_rest = true
```

### Backend
```python
# В brain_service/api/audio.py
AUDIO_STORAGE_DIR = Path("audio_storage")
```

## 🚀 Преимущества

- **Экономия токенов** - аудио не теряется после воспроизведения
- **История чата** - можно переслушать любое аудио
- **Скачивание** - можно сохранить аудио локально
- **Управление** - полный контроль над воспроизведением
- **Интеграция** - работает с существующей системой сообщений
- **Масштабируемость** - поддержка разных TTS провайдеров

## 🔮 Будущие улучшения

- [ ] **Кэширование** аудио на клиенте
- [ ] **Сжатие** аудио для экономии места
- [ ] **Потоковое воспроизведение** для больших файлов
- [ ] **Плейлисты** для последовательного воспроизведения
- [ ] **Транскрипция** аудио в текст
- [ ] **Поиск** по аудио сообщениям


