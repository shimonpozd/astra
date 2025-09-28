# Astra Web Client

Минимальный веб-клиент для общения с Astra через браузер.

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
cd astra-web-client
npm install
```

Или используйте скрипт для полной установки:

```bash
chmod +x install-deps.sh
./install-deps.sh
```

### 2. Запуск в режиме разработки

```bash
npm run dev
```

Откройте http://localhost:5173 в браузере.

### 3. Сборка для продакшена

```bash
npm run build
```

## 🔧 Настройка

### API адрес

По умолчанию клиент подключается к Brain API на `http://localhost:7030`.

Если нужно изменить адрес, отредактируйте `src/services/api.ts`:

```typescript
const API_BASE = 'http://your-brain-api:port';
```

### Персоны

Персоны загружаются из `personalities.json` на сервере. Убедитесь что файл доступен по пути `/personalities.json`.

## 📁 Структура проекта

```
src/
├── components/          # React компоненты
│   ├── Chat.tsx        # Основное окно чата
│   ├── Message.tsx     # Компонент сообщения
│   ├── PersonaSelector.tsx # Выбор персоны
│   └── ModelSettings.tsx   # Настройки модели
├── services/
│   └── api.ts          # API клиент для Brain
├── types/
│   └── index.ts        # TypeScript типы
├── App.tsx             # Главный компонент
└── main.tsx           # Точка входа
```

## 🎯 Функции

- ✅ Простое окно чата с сообщениями
- ✅ Выбор персоны из personalities.json
- ✅ Настройки модели (temperature, max tokens)
- ✅ Отправка сообщений через Brain API
- ✅ Адаптивный дизайн
- ✅ Поддержка клавиш Enter/Shift+Enter

## 🔄 Развитие

Это MVP версия. В будущем планируется добавить:

- Сохранение истории чатов
- Drag & drop файлов
- Темы (светлая/темная)
- Горячие клавиши
- TTS интеграция
- Study режим

## 🐛 Отладка

### Проверка API

Убедитесь что Brain сервис запущен:

```bash
curl http://localhost:7030/
```

### Логи браузера

Откройте DevTools (F12) и проверьте консоль на ошибки.

### Проверка сети

В DevTools → Network проверьте запросы к API.

## 📱 Поддержка браузеров

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Разработка

### Добавление новых компонентов

1. Создайте компонент в `src/components/`
2. Добавьте типы в `src/types/`
3. Импортируйте в нужном месте

### API интеграция

Используйте `src/services/api.ts` для всех запросов к Brain API.

## 📄 Лицензия

MIT