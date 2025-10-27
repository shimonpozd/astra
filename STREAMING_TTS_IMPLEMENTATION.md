# 🎵 Streaming TTS Implementation

Система стриминга TTS позволяет воспроизводить аудио **сразу** без ожидания полной генерации, экономя время и улучшая UX.

## 🚀 Преимущества стриминга

✅ **Быстрый старт** - воспроизведение начинается сразу  
✅ **Экономия времени** - не ждем полной генерации  
✅ **Лучший UX** - пользователь слышит аудио мгновенно  
✅ **Экономия памяти** - не загружаем весь файл в память  
✅ **Масштабируемость** - работает с любыми размерами текста  

## 📁 Компоненты стриминга

### 1. **SimpleStreamingTTS** - Простой стриминг
```tsx
<SimpleStreamingTTS
  text="Текст для озвучки"
  language="en"
  voiceId="yandex-oksana"
  speed={1.0}
/>
```

**Особенности:**
- 🎯 **Простота** - одна кнопка воспроизведения
- ⚡ **Быстрота** - минимальная задержка
- 🔄 **Автоматическое воспроизведение** - начинает играть сразу

### 2. **StreamingAudioMessage** - Продвинутый стриминг
```tsx
<StreamingAudioMessage
  text="Текст для озвучки"
  chatId="chat-123"
  voiceId="yandex-oksana"
  onAudioSaved={(message) => console.log('Saved:', message)}
/>
```

**Особенности:**
- 🎛️ **Полный контроль** - пауза, перемотка, прогресс
- 💾 **Сохранение** - можно сохранить в чат
- 📊 **Прогресс бар** - видно прогресс воспроизведения
- 📥 **Скачивание** - можно скачать аудио

### 3. **useStreamingTTS** - Хук для стриминга
```typescript
const {
  isPlaying,
  isLoading,
  error,
  currentTime,
  duration,
  play,
  pause,
  stop,
  seek
} = useStreamingTTS({
  voiceId: 'yandex-oksana',
  language: 'en',
  speed: 1.0
});

// Использование
await play("Текст для озвучки");
```

## 🔄 Поток стриминга

### 1. **Инициация стриминга**
```typescript
// Пользователь нажимает кнопку
const response = await fetch('/api/tts/stream', {
  method: 'POST',
  body: JSON.stringify({
    text: "Текст для озвучки",
    language: "en",
    voice_id: "yandex-oksana",
    speed: 1.0
  })
});
```

### 2. **Создание MediaSource**
```typescript
const mediaSource = new MediaSource();
const audioUrl = URL.createObjectURL(mediaSource);
const audio = new Audio(audioUrl);
```

### 3. **Чтение потока**
```typescript
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  // Добавляем аудио данные в буфер
  sourceBuffer.appendBuffer(value);
}
```

### 4. **Воспроизведение**
```typescript
// Аудио начинает играть сразу, как только
// первые данные поступают в буфер
audio.play();
```

## 🎯 Сценарии использования

### **Быстрое прослушивание**
```tsx
// Для быстрого прослушивания без сохранения
<SimpleStreamingTTS text={messageText} />
```

### **Сохранение в чат**
```tsx
// Для сохранения аудио как сообщения
<StreamingAudioMessage 
  text={messageText}
  chatId={currentChatId}
  onAudioSaved={handleAudioSaved}
/>
```

### **Программное управление**
```tsx
// Для программного управления
const streamingTTS = useStreamingTTS();

const handlePlay = () => {
  streamingTTS.play("Текст для озвучки");
};
```

## 🔧 Технические детали

### **MediaSource API**
- Использует `MediaSource` для потокового воспроизведения
- Поддерживает `audio/mpeg`, `audio/ogg`, `audio/wav`
- Автоматическое буферизирование

### **TTS Backend**
- Endpoint: `POST /api/tts/stream`
- Поддержка всех провайдеров: Yandex, ElevenLabs, XTTS, Orpheus
- Потоковая передача аудио данных

### **Обработка ошибок**
- Автоматический retry при сбоях
- Fallback на обычное воспроизведение
- Информативные сообщения об ошибках

## 📊 Сравнение подходов

| Подход | Скорость | Функции | Сложность |
|--------|----------|---------|-----------|
| **Обычный TTS** | Медленно | Базовые | Простая |
| **SimpleStreaming** | Быстро | Базовые | Простая |
| **StreamingMessage** | Быстро | Полные | Средняя |
| **Программный** | Быстро | Максимальные | Сложная |

## 🚀 Рекомендации

### **Для быстрого прослушивания:**
```tsx
<SimpleStreamingTTS text={text} />
```

### **Для сохранения в чат:**
```tsx
<StreamingAudioMessage 
  text={text} 
  chatId={chatId}
  onAudioSaved={handleSave}
/>
```

### **Для сложной логики:**
```tsx
const streamingTTS = useStreamingTTS();
// Программное управление
```

## 🔮 Будущие улучшения

- [ ] **Адаптивное качество** - изменение битрейта по сети
- [ ] **Предзагрузка** - кэширование популярных фраз
- [ ] **Параллельные потоки** - несколько аудио одновременно
- [ ] **Умная буферизация** - предсказание следующих фраз
- [ ] **Офлайн режим** - кэширование для работы без сети

## 🎵 Результат

Теперь у вас есть **три уровня** TTS:

1. **⚡ SimpleStreaming** - мгновенное воспроизведение
2. **🎛️ StreamingMessage** - полный контроль + сохранение  
3. **💾 AudioMessage** - постоянное хранение в чате

Пользователи получают **лучший опыт** - аудио начинает играть сразу, а не через несколько секунд ожидания! 🚀


