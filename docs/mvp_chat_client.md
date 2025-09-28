# MVP Веб-клиент для чата Astra

## 🎯 Цель

Создать простую замену CLI-клиенту - минимальное веб-приложение для общения с Astra через браузер.

## 📋 Требования MVP

### Функциональность
- ✅ Простое окно чата
- ✅ Отправка сообщений
- ✅ Получение ответов в реальном времени
- ✅ Выбор персоны
- ✅ Базовые настройки модели
- ✅ Адаптивный дизайн

### Не нужно пока
- ❌ Сохранение истории чатов
- ❌ Загрузка файлов
- ❌ Исследовательский режим
- ❌ Управление сервисами
- ❌ Множество настроек

## 🛠 Технический стек

### Frontend
- **React 18** - основной фреймворк
- **Vite** - быстрая сборка и dev server
- **TypeScript** - типизация
- **Tailwind CSS** - стили
- **shadcn/ui** - готовые компоненты (опционально)

### Backend
- Используем существующий **Brain API** на порту 7030
- Эндпоинты: `/chat/stream`, `/chat/text`

## 📁 Структура проекта

```
astra-web-client/
├── src/
│   ├── components/
│   │   ├── Chat.tsx          # Основной компонент чата
│   │   ├── Message.tsx       # Компонент сообщения
│   │   ├── PersonaSelector.tsx # Выбор персоны
│   │   └── ModelSettings.tsx # Настройки модели
│   ├── services/
│   │   └── api.ts           # API клиент
│   ├── types/
│   │   └── index.ts         # Типы TypeScript
│   ├── App.tsx              # Главный компонент
│   └── main.tsx            # Точка входа
├── public/
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## 🚀 Быстрый старт

### 1. Создание проекта

```bash
# Создать React проект с Vite
npm create vite@latest astra-web-client -- --template react-ts
cd astra-web-client
npm install
```

### 2. Установка зависимостей

```bash
npm install axios
npm install lucide-react  # для иконок
```

### 3. Настройка Tailwind (опционально)

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 4. Структура файлов

**src/App.tsx** - главный компонент:

```tsx
import { useState } from 'react';
import Chat from './components/Chat';
import PersonaSelector from './components/PersonaSelector';
import ModelSettings from './components/ModelSettings';

function App() {
  const [selectedPersona, setSelectedPersona] = useState('default');
  const [modelSettings, setModelSettings] = useState({
    temperature: 0.7,
    maxTokens: 2000
  });

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Верхняя панель */}
      <header className="bg-white border-b p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Astra Chat</h1>
          <div className="flex gap-4">
            <PersonaSelector
              selected={selectedPersona}
              onSelect={setSelectedPersona}
            />
            <ModelSettings
              settings={modelSettings}
              onChange={setModelSettings}
            />
          </div>
        </div>
      </header>

      {/* Основная область чата */}
      <main className="flex-1 overflow-hidden">
        <Chat
          persona={selectedPersona}
          modelSettings={modelSettings}
        />
      </main>
    </div>
  );
}

export default App;
```

**src/components/Chat.tsx** - компонент чата:

```tsx
import { useState, useRef, useEffect } from 'react';
import Message from './Message';
import { api } from '../services/api';

interface ChatProps {
  persona: string;
  modelSettings: any;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Chat({ persona, modelSettings }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.sendMessage({
        text: input,
        agent_id: persona,
        ...modelSettings
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Произошла ошибка при отправке сообщения',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="text-gray-500">Печатает...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="border-t p-4 bg-white">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Введите сообщение..."
            className="flex-1 p-2 border rounded-lg resize-none"
            rows={3}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
```

**src/components/Message.tsx** - компонент сообщения:

```tsx
interface MessageProps {
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  };
}

export default function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isUser
            ? 'bg-blue-500 text-white'
            : 'bg-gray-200 text-gray-900'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <p className={`text-xs mt-1 ${
          isUser ? 'text-blue-100' : 'text-gray-500'
        }`}>
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
```

**src/components/PersonaSelector.tsx** - выбор персоны:

```tsx
import { useState, useEffect } from 'react';

interface PersonaSelectorProps {
  selected: string;
  onSelect: (persona: string) => void;
}

export default function PersonaSelector({ selected, onSelect }: PersonaSelectorProps) {
  const [personas, setPersonas] = useState<string[]>(['default']);

  useEffect(() => {
    // Загрузить персоны из personalities.json
    fetch('/personalities.json')
      .then(res => res.json())
      .then(data => setPersonas(Object.keys(data)))
      .catch(err => console.error('Error loading personas:', err));
  }, []);

  return (
    <select
      value={selected}
      onChange={(e) => onSelect(e.target.value)}
      className="px-3 py-1 border rounded"
    >
      {personas.map(persona => (
        <option key={persona} value={persona}>
          {persona}
        </option>
      ))}
    </select>
  );
}
```

**src/components/ModelSettings.tsx** - настройки модели:

```tsx
interface ModelSettingsProps {
  settings: {
    temperature: number;
    maxTokens: number;
  };
  onChange: (settings: any) => void;
}

export default function ModelSettings({ settings, onChange }: ModelSettingsProps) {
  return (
    <div className="flex gap-4 items-center">
      <div>
        <label className="block text-sm">Temperature</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={settings.temperature}
          onChange={(e) => onChange({
            ...settings,
            temperature: parseFloat(e.target.value)
          })}
          className="w-20"
        />
        <span className="text-sm">{settings.temperature}</span>
      </div>

      <div>
        <label className="block text-sm">Max Tokens</label>
        <input
          type="number"
          value={settings.maxTokens}
          onChange={(e) => onChange({
            ...settings,
            maxTokens: parseInt(e.target.value)
          })}
          className="w-20 px-2 py-1 border rounded"
        />
      </div>
    </div>
  );
}
```

**src/services/api.ts** - API клиент:

```typescript
const API_BASE = 'http://localhost:7030';

export const api = {
  async sendMessage(data: {
    text: string;
    agent_id: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const response = await fetch(`${API_BASE}/chat/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.reply;
  },

  async sendMessageStream(data: {
    text: string;
    agent_id: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.body!;
  }
};
```

## 🎨 Стилизация

**tailwind.config.js**:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**src/index.css**:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}
```

## 🚀 Запуск

### 1. Установка и запуск

```bash
cd astra-web-client
npm install
npm run dev
```

### 2. Доступ к приложению

- **Frontend**: http://localhost:5173
- **Backend (Brain)**: http://localhost:7030

### 3. Проверка API

Убедитесь что Brain сервис запущен:
```bash
# Проверить статус
curl http://localhost:7030/
```

## 🔧 Настройки

### 1. Конфигурация API

В `src/services/api.ts` изменить `API_BASE` если нужно:
```typescript
const API_BASE = 'http://localhost:7030'; // или ваш адрес
```

### 2. Персоны

Персоны загружаются из `/personalities.json` на сервере. Убедитесь что файл доступен.

## 📱 Особенности

### Адаптивность
- Работает на десктопе и мобильных устройствах
- Адаптивная ширина сообщений
- Touch-friendly интерфейс

### Простота
- Минималистичный дизайн
- Только необходимые функции
- Быстрая загрузка

### Функциональность
- Реальное время ответы
- Настройки модели
- Выбор персоны
- Обработка ошибок

## 🔄 Расширение

После MVP можно легко добавить:
- Сохранение истории чатов
- Drag & drop файлов
- Темы (светлая/темная)
- Горячие клавиши
- Уведомления

## ✅ Готовность

MVP готов к использованию сразу после настройки и будет полноценной заменой CLI-клиенту с веб-интерфейсом.

Хотите перейти к реализации этого MVP?