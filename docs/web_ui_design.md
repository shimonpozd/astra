# Веб-интерфейс универсального клиента

## Обзор

Современный веб-интерфейс на React + TypeScript с использованием shadcn/ui и Framer Motion для создания полнофункционального клиента системы Astra.

## Архитектура

### 1. Технологический стек

- **Frontend Framework**: React 18+ с TypeScript
- **UI Library**: shadcn/ui (Radix UI + Tailwind CSS)
- **Animations**: Framer Motion
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Routing**: React Router
- **Icons**: Lucide React
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

### 2. Структура проекта

```
src/
├── components/
│   ├── ui/                 # Базовые UI компоненты (shadcn)
│   ├── layout/            # Компоненты макета
│   ├── chat/              # Компоненты чата
│   ├── study/             # Компоненты study режима
│   ├── model-control/      # Панель управления моделью
│   ├── persona/           # Менеджер персон
│   ├── research/          # Исследовательские компоненты
│   ├── services/          # Панель сервисов
│   └── common/            # Общие компоненты
├── hooks/                 # Кастомные хуки
├── stores/                # Zustand stores
├── services/              # API сервисы
├── types/                 # TypeScript типы
├── utils/                 # Утилиты
├── pages/                 # Страницы приложения
└── styles/                # Глобальные стили
```

## Основные компоненты

### 1. Главный макет (Layout)

```typescript
// components/layout/MainLayout.tsx
const MainLayout = () => {
  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
      <Footer />
    </div>
  );
};
```

### 2. Левая панель (Sidebar)

```typescript
// components/layout/Sidebar.tsx
const Sidebar = () => {
  const [chats, setChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="w-80 border-r bg-muted/30 flex flex-col">
      {/* Поиск чатов */}
      <div className="p-4 border-b">
        <Input
          placeholder="Поиск чатов..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* Список чатов */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {chats.map((chat) => (
            <ChatItem key={chat.id} chat={chat} />
          ))}
        </div>
      </ScrollArea>

      {/* Кнопка нового чата */}
      <div className="p-4 border-t">
        <Button className="w-full" onClick={createNewChat}>
          <Plus className="w-4 h-4 mr-2" />
          Новый чат
        </Button>
      </div>
    </div>
  );
};
```

### 3. Основная область (MainContent)

```typescript
// components/layout/MainContent.tsx
const MainContent = () => {
  return (
    <div className="flex-1 flex flex-col">
      {/* Верхняя панель */}
      <TopBar />

      {/* Область сообщений */}
      <MessagesArea />

      {/* Composer */}
      <Composer />
    </div>
  );
};
```

## Компоненты чата

### 1. Сообщение (Message)

```typescript
// components/chat/Message.tsx
interface MessageProps {
  message: UnifiedResponse;
  onToggleThinking?: () => void;
  onPlayTTS?: () => void;
}

const Message = ({ message, onToggleThinking, onPlayTTS }: MessageProps) => {
  return (
    <div className="group relative">
      {/* Аватар и роль */}
      <div className="flex items-start gap-3 mb-2">
        <Avatar role={message.role} />
        <div className="flex-1 min-w-0">
          {/* Display контент */}
          {message.display.map((item, index) => (
            <DisplayItem key={index} item={item} />
          ))}

          {/* Source контент */}
          {message.source && (
            <Sources sources={message.source} />
          )}

          {/* TTS кнопка */}
          {message.tts && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPlayTTS}
              className="mt-2"
            >
              <Volume2 className="w-4 h-4" />
            </Button>
          )}

          {/* Thinking toggle */}
          {message.thinking && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleThinking}
              className="mt-2"
            >
              <Brain className="w-4 h-4" />
              Размышления
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
```

### 2. Display Item

```typescript
// components/chat/DisplayItem.tsx
interface DisplayItemProps {
  item: DisplayContent;
}

const DisplayItem = ({ item }: DisplayItemProps) => {
  const renderContent = () => {
    switch (item.type) {
      case 'text':
        return (
          <div className={item.metadata?.direction === 'rtl' ? 'rtl' : 'ltr'}>
            {item.value}
          </div>
        );

      case 'hebrew':
        return (
          <div className="rtl font-hebrew" dir="rtl">
            {item.value}
          </div>
        );

      case 'html':
        return (
          <div dangerouslySetInnerHTML={{ __html: item.value }} />
        );

      case 'image':
        return (
          <img
            src={item.value}
            alt={item.metadata?.alt || ''}
            className="max-w-full h-auto rounded"
          />
        );

      case 'audio':
        return (
          <audio controls className="w-full">
            <source src={item.value} type={item.metadata?.format} />
          </audio>
        );

      default:
        return <div>{item.value}</div>;
    }
  };

  return (
    <div className="message-content">
      {renderContent()}
    </div>
  );
};
```

### 3. Sources (Источники)

```typescript
// components/chat/Sources.tsx
const Sources = ({ sources }: { sources: Source[] }) => {
  return (
    <div className="mt-3 p-3 bg-muted/50 rounded-lg">
      <h4 className="text-sm font-medium mb-2">Источники:</h4>
      <div className="space-y-2">
        {sources.map((source, index) => (
          <div key={index} className="text-sm">
            <div className="font-medium">
              {source.ref} {source.commentator && `(${source.commentator})`}
            </div>
            <div className="text-muted-foreground mt-1">
              {source.snippet}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

## Composer (Поле ввода)

### 1. Основной компонент

```typescript
// components/chat/Composer.tsx
const Composer = () => {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  const handleSubmit = async () => {
    if (!text.trim()) return;

    await sendMessage({
      text,
      attachments,
      // ... другие параметры
    });

    setText("");
    setAttachments([]);
  };

  const handleFileDrop = (files: File[]) => {
    setAttachments(prev => [...prev, ...files]);
  };

  return (
    <div className="border-t p-4">
      {/* Прикрепленные файлы */}
      {attachments.length > 0 && (
        <AttachmentList
          attachments={attachments}
          onRemove={(index) => {
            setAttachments(prev => prev.filter((_, i) => i !== index));
          }}
        />
      )}

      {/* Поле ввода */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Textarea
            value={text}
            onChange={setText}
            placeholder="Введите сообщение..."
            className="min-h-[60px] max-h-[200px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          {/* Кнопки действий */}
          <div className="absolute bottom-2 right-2 flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsRecording(!isRecording)}
            >
              <Mic className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={!text.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Параметры модели */}
      <ModelParamsBar />
    </div>
  );
};
```

### 2. Параметры модели

```typescript
// components/chat/ModelParamsBar.tsx
const ModelParamsBar = () => {
  const [params, setParams] = useState({
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 2000,
    reasoning: 'medium'
  });

  return (
    <div className="flex items-center gap-4 mt-2 text-sm">
      <div className="flex items-center gap-2">
        <span>Temp:</span>
        <Slider
          value={params.temperature}
          onChange={(value) => setParams(prev => ({ ...prev, temperature: value }))}
          min={0}
          max={2}
          step={0.1}
          className="w-20"
        />
        <span>{params.temperature}</span>
      </div>

      <div className="flex items-center gap-2">
        <span>Top P:</span>
        <Slider
          value={params.top_p}
          onChange={(value) => setParams(prev => ({ ...prev, top_p: value }))}
          min={0}
          max={1}
          step={0.05}
          className="w-20"
        />
        <span>{params.top_p}</span>
      </div>

      <Select
        value={params.reasoning}
        onValueChange={(value) => setParams(prev => ({ ...prev, reasoning: value }))}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="off">Без размышлений</SelectItem>
          <SelectItem value="low">Минимально</SelectItem>
          <SelectItem value="medium">Средне</SelectItem>
          <SelectItem value="high">Максимально</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
```

## Панели управления

### 1. Model Control Drawer

```typescript
// components/model-control/ModelControlDrawer.tsx
const ModelControlDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState({
    provider: 'openrouter',
    model: 'deepseek-chat',
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 2000,
    reasoning: 'medium'
  });

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Settings className="w-4 h-4" />
        Модель
      </Button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-96">
          <SheetHeader>
            <SheetTitle>Настройки модели</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Провайдер */}
            <div className="space-y-2">
              <Label>Провайдер</Label>
              <Select
                value={config.provider}
                onValueChange={(value) => setConfig(prev => ({ ...prev, provider: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Модель */}
            <div className="space-y-2">
              <Label>Модель</Label>
              <Select
                value={config.model}
                onValueChange={(value) => setConfig(prev => ({ ...prev, model: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Модели загружаются динамически */}
                </SelectContent>
              </Select>
            </div>

            {/* Параметры */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Temperature: {config.temperature}</Label>
                <Slider
                  value={config.temperature}
                  onChange={(value) => setConfig(prev => ({ ...prev, temperature: value }))}
                  min={0}
                  max={2}
                  step={0.1}
                />
              </div>

              <div className="space-y-2">
                <Label>Top P: {config.top_p}</Label>
                <Slider
                  value={config.top_p}
                  onChange={(value) => setConfig(prev => ({ ...prev, top_p: value }))}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>

              <div className="space-y-2">
                <Label>Max Tokens: {config.max_tokens}</Label>
                <Slider
                  value={config.max_tokens}
                  onChange={(value) => setConfig(prev => ({ ...prev, max_tokens: value }))}
                  min={100}
                  max={4000}
                  step={100}
                />
              </div>
            </div>

            {/* Reasoning */}
            <div className="space-y-2">
              <Label>Режим размышлений</Label>
              <Select
                value={config.reasoning}
                onValueChange={(value) => setConfig(prev => ({ ...prev, reasoning: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Отключено</SelectItem>
                  <SelectItem value="low">Минимальный</SelectItem>
                  <SelectItem value="medium">Средний</SelectItem>
                  <SelectItem value="high">Максимальный</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => {
              saveConfig(config);
              setIsOpen(false);
            }}>
              Сохранить
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};
```

### 2. Persona Manager

```typescript
// components/persona/PersonaManager.tsx
const PersonaManager = () => {
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState(null);

  return (
    <div className="space-y-4">
      {/* Список персон */}
      <div className="grid grid-cols-2 gap-4">
        {personas.map((persona) => (
          <PersonaCard
            key={persona.name}
            persona={persona}
            isSelected={selectedPersona?.name === persona.name}
            onSelect={() => setSelectedPersona(persona)}
            onEdit={() => editPersona(persona)}
          />
        ))}
      </div>

      {/* Детали выбранной персоны */}
      {selectedPersona && (
        <div className="p-4 border rounded-lg">
          <h3 className="font-medium mb-2">{selectedPersona.name}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {selectedPersona.description}
          </p>

          {/* Флаги */}
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedPersona.use_sefaria_tools && (
              <Badge variant="secondary">Sefaria</Badge>
            )}
            {selectedPersona.use_mem0_tool && (
              <Badge variant="secondary">Memory</Badge>
            )}
            {selectedPersona.use_graph_context && (
              <Badge variant="secondary">Graph</Badge>
            )}
          </div>

          {/* Системный промпт */}
          <details className="text-sm">
            <summary className="cursor-pointer">Системный промпт</summary>
            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
              {selectedPersona.system_prompt}
            </pre>
          </details>
        </div>
      )}

      {/* Кнопки действий */}
      <div className="flex gap-2">
        <Button onClick={() => createNewPersona()}>
          <Plus className="w-4 h-4 mr-2" />
          Новая персона
        </Button>

        {selectedPersona && (
          <Button variant="outline" onClick={() => editPersona(selectedPersona)}>
            <Edit className="w-4 h-4 mr-2" />
            Редактировать
          </Button>
        )}
      </div>
    </div>
  );
};
```

## Study режим

### 1. Основной компонент

```typescript
// components/study/StudyMode.tsx
const StudyMode = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [sources, setSources] = useState([]);
  const [displayContent, setDisplayContent] = useState("");

  const steps = [
    { id: 'text', title: 'Текст', component: TextStep },
    { id: 'comments', title: 'Комментарии', component: CommentsStep },
    { id: 'explanation', title: 'Пояснение', component: ExplanationStep },
    { id: 'summary', title: 'Вывод', component: SummaryStep }
  ];

  return (
    <div className="h-full flex">
      {/* Левая панель - источники */}
      <div className="w-1/2 border-r p-4">
        <SourcesPanel sources={sources} />
      </div>

      {/* Правая панель - контент */}
      <div className="flex-1 p-4">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Режим изучения</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                Назад
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                disabled={currentStep === steps.length - 1}
              >
                Далее
              </Button>
            </div>
          </div>

          {/* Индикатор прогресса */}
          <div className="flex gap-2 mt-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex-1 h-2 rounded ${
                  index <= currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Текущий шаг */}
        <div className="flex-1">
          {React.createElement(steps[currentStep].component, {
            content: displayContent,
            sources,
            onNext: () => setCurrentStep(currentStep + 1),
            onPrev: () => setCurrentStep(currentStep - 1)
          })}
        </div>
      </div>
    </div>
  );
};
```

### 2. TTS с караоке

```typescript
// components/study/TTSKaraoke.tsx
const TTSKaraoke = ({ text, voice, onPlay, onPause, onStop }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const words = text.split(' ');

  return (
    <div className="space-y-4">
      {/* Контролы */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsPlaying(!isPlaying);
            if (isPlaying) {
              onPause();
            } else {
              onPlay();
            }
          }}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>

        <Button variant="outline" size="sm" onClick={onStop}>
          <Square className="w-4 h-4" />
        </Button>

        <span className="text-sm text-muted-foreground">
          {Math.floor(currentTime)}s / {Math.floor(text.length / 10)}s
        </span>
      </div>

      {/* Текст с подсветкой */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="text-lg leading-relaxed">
          {words.map((word, index) => (
            <span
              key={index}
              className={`transition-colors ${
                index === currentWordIndex
                  ? 'bg-primary text-primary-foreground px-1 rounded'
                  : ''
              } ${
                index < currentWordIndex
                  ? 'text-muted-foreground'
                  : 'text-foreground'
              }`}
            >
              {word}{' '}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
```

## API интеграция

### 1. API клиент

```typescript
// services/api.ts
class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = 'http://localhost:7030') {
    this.baseURL = baseURL;
  }

  async chatStream(request: ChatRequest): Promise<ReadableStream> {
    const response = await fetch(`${this.baseURL}/chat/unified`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.body!;
  }

  async getServiceStatus(): Promise<ServiceStatus> {
    const response = await fetch(`${this.baseURL}/supervisor/status`);
    return response.json();
  }

  async restartService(serviceName: string): Promise<void> {
    await fetch(`${this.baseURL}/supervisor/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: serviceName }),
    });
  }

  async getProfiles(): Promise<Profile[]> {
    const response = await fetch(`${this.baseURL}/profiles`);
    return response.json();
  }

  async activateProfile(profileName: string): Promise<void> {
    await fetch(`${this.baseURL}/profiles/${profileName}/activate`, {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
```

### 2. Обработка стриминга

```typescript
// hooks/useChatStream.ts
export const useChatStream = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = async (request: ChatRequest) => {
    setIsStreaming(true);

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: request.text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newMessage]);

    try {
      const stream = await api.chatStream(request);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = '';
      const assistantMessageId = Date.now().toString() + '_assistant';

      // Создать пустое сообщение ассистента
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'content') {
                assistantMessage += data.chunk;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantMessage }
                      : msg
                  )
                );
              } else if (data.type === 'complete') {
                // Обновить сообщение финальными данными
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          ...data.response,
                          isStreaming: false
                        }
                      : msg
                  )
                );
              }
            } catch (e) {
              console.error('Error parsing stream data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in chat stream:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'error',
        content: `Ошибка: ${error.message}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  return {
    messages,
    isStreaming,
    sendMessage,
  };
};
```

## Анимации и переходы

### 1. Framer Motion интеграция

```typescript
// components/common/AnimatedMessage.tsx
import { motion, AnimatePresence } from 'framer-motion';

const AnimatedMessage = ({ message, children }: AnimatedMessageProps) => {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{
          duration: 0.3,
          ease: "easeOut"
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
```

### 2. Skeleton loading

```typescript
// components/common/LoadingSkeleton.tsx
const LoadingSkeleton = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-24 h-4" />
      </div>
      <div className="space-y-2">
        <Skeleton className="w-full h-4" />
        <Skeleton className="w-3/4 h-4" />
        <Skeleton className="w-1/2 h-4" />
      </div>
    </div>
  );
};
```

## Темы и кастомизация

### 1. Темная/светлая тема

```typescript
// stores/themeStore.ts
import { create } from 'zustand';

interface ThemeStore {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'system',
  setTheme: (theme) => set({ theme }),
}));
```

### 2. Настройки интерфейса

```typescript
// stores/uiStore.ts
interface UIStore {
  sidebarCollapsed: boolean;
  showThinking: boolean;
  autoScroll: boolean;
  fontSize: 'small' | 'medium' | 'large';
  // ... другие настройки
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  showThinking: false,
  autoScroll: true,
  fontSize: 'medium',
}));
```

## Следующие шаги

1. Создать базовую структуру проекта
2. Настроить Vite + React + TypeScript
3. Установить и настроить shadcn/ui
4. Создать основные компоненты макета
5. Реализовать API клиент
6. Добавить обработку сообщений
7. Создать компоненты для study режима
8. Добавить анимации и переходы
9. Тестирование и отладка
10. Документация компонентов