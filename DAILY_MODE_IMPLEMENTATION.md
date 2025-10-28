# Daily Mode Implementation - Результаты работы

## 🎯 Обзор

Реализован полнофункциональный **Daily Mode** для системы изучения еврейских текстов. Daily Mode автоматически создает ежедневные сессии изучения на основе календаря Sefaria и обеспечивает сегментированное отображение текстов.

## ✅ Что реализовано

### 1. Daily Calendar Integration
- **API endpoints**: `GET /daily/calendar`, `POST /daily/create/{session_id}`, `PATCH /daily/{session_id}/complete`
- **Lazy loading**: Daily чаты создаются только при клике пользователя
- **Virtual listing**: Daily чаты отображаются в sidebar без создания backend сессий
- **Sefaria calendar API**: Интеграция с `https://www.sefaria.org/api/calendars`

### 2. Frontend Integration
- **ChatSidebar**: Daily чаты в collapsible секции с красной темой
- **Progress indicators**: "Daily (2/13)" с чекбоксами завершения
- **Auto Study Mode**: Клик на daily chat автоматически открывает Study Mode
- **Simplified names**: Только название типа изучения (например, "Daf Yomi")

### 3. Text Segmentation
- **Range parsing**: Поддержка диапазонов типа "Deuteronomy 32:1-52"
- **Inter-chapter ranges**: Обработка "Arukh HaShulchan, Orach Chaim 162:28-164:3"
- **Multiple formats**: Поддержка `-`, `–`, `—`, `..` в диапазонах
- **Background loading**: Фоновая загрузка оставшихся сегментов

### 4. HTML Text Cleaning
- **HTML entities**: Очистка `&nbsp;`, `&amp;`, `&lt;` и других
- **Multiple spaces**: Замена множественных пробелов на один
- **Hebrew text**: Корректное отображение Hebrew текста без артефактов

### 5. Redis Architecture
- **Separate keyspaces**: `daily:sess:{id}:*` vs `study:sess:{id}:*`
- **Chat history**: `daily:sess:{id}:history_list`
- **Legacy migration**: Автоматическая миграция старых ключей
- **Session persistence**: Сохранение daily reference в `daily:sess:{id}:top`

### 6. Study Mode Integration
- **Dual mode**: Daily и Study режимы в одном интерфейсе
- **Chat history**: Daily чаты сохраняют историю сообщений
- **Bookshelf**: `None` для daily mode (не нужен)
- **Navigation**: Полная навигация между сегментами

## 🔧 Технические детали

### Backend Changes

#### `brain_service/api/chat.py`
```python
# Daily calendar endpoints
GET /daily/calendar          # Virtual list of today's daily items
POST /daily/create/{id}      # Lazy creation of specific daily session
PATCH /daily/{id}/complete   # Mark daily session as completed
```

#### `brain_service/services/study_service.py`
```python
# Daily mode detection
is_daily_session = request.is_daily if request.is_daily is not None else request.session_id.startswith('daily-')

# Daily reference persistence
redis_key = f"daily:sess:{request.session_id}:top"
await self.redis_client.set(redis_key, json.dumps({"ref": request.ref}))

# Background loading
asyncio.create_task(_load_remaining_segments_background(...))
```

#### `brain_service/services/study_utils.py`
```python
# HTML text cleaning
def _clean_html_text(text: str) -> str:
    text = html.unescape(text)  # Decode &nbsp; &amp; etc.
    text = re.sub(r'<[^>]+>', '', text)  # Remove HTML tags
    text = re.sub(r'\s+', ' ', text).strip()  # Clean multiple spaces
    return text

# Range parsing with multiple formats
range_match = re.search(r'(\d+)[\-\–\—\.]+(\d+)', verse_part)
```

#### `brain_service/models/study_models.py`
```python
class StudySetFocusRequest(BaseModel):
    session_id: str
    ref: str
    window_size: Optional[int] = 5
    navigation_type: str = "drill_down"
    is_daily: Optional[bool] = None  # Explicit daily flag
```

#### `brain_service/services/study_state.py`
```python
class StudySnapshot(BaseModel):
    segments: Optional[List[TextSegment]] = None
    focusIndex: Optional[int] = None
    ref: Optional[str] = None
    bookshelf: Optional[Bookshelf] = None  # Optional for daily mode
    chat_local: List[ChatMessage] = Field(default_factory=list)
    ts: int
    workbench: Dict[str, Optional[Union[TextDisplay, BookshelfItem, str]]] = Field(default_factory=lambda: {"left": None, "right": None})
    discussion_focus_ref: Optional[str] = None
```

### Frontend Changes

#### `astra-web-client/src/services/api.ts`
```typescript
interface Chat {
  id: string;
  name: string;
  type: 'chat' | 'study' | 'daily';
  completed?: boolean;
}

interface VirtualDailyChat {
  session_id: string;
  title: string;
  display_value: string;
  ref: string;
  date: string;
}

// API functions
async function getDailyCalendar(): Promise<VirtualDailyChat[]>
async function createDailySessionLazy(sessionId: string): Promise<boolean>
```

#### `astra-web-client/src/hooks/useChat.ts`
```typescript
// Load daily calendar in parallel with regular chats
const [chats, dailyCalendar] = await Promise.all([
  api.getChatList(),
  api.getDailyCalendar()
]);

// Combine and sort (daily first)
const allChats = [
  ...dailyCalendar.map(item => ({
    id: item.session_id,
    name: item.title,  // Simplified name
    type: 'daily' as const,
    completed: false
  })),
  ...chats
];
```

#### `astra-web-client/src/components/chat/ChatSidebar.tsx`
```typescript
// Collapsible daily section
const [isDailyExpanded, setIsDailyExpanded] = useState(true);
const dailyChats = chats.filter(chat => chat.type === 'daily');
const regularChats = chats.filter(chat => chat.type !== 'daily');

// Daily section with progress
<div className="border-b border-gray-200 pb-2">
  <button 
    onClick={() => setIsDailyExpanded(!isDailyExpanded)}
    className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
  >
    <span>Daily ({completedDailyCount}/{dailyChats.length})</span>
    {isDailyExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
  </button>
</div>
```

## 🚀 Как использовать

### 1. Запуск системы
```bash
# Backend
uvicorn brain_service.main:app --host 0.0.0.0 --port 8001

# Frontend  
cd astra-web-client && npm run dev
```

### 2. Daily Mode
1. **Откройте sidebar** - увидите секцию "Daily (X/Y)"
2. **Кликните на daily chat** - автоматически откроется Study Mode
3. **Навигируйте между сегментами** - используйте стрелки или клики
4. **Читайте Hebrew текст** - без HTML артефактов
5. **Общайтесь с AI** - история сохраняется

### 3. Поддерживаемые форматы
- **Tanakh ranges**: "Deuteronomy 32:1-52"
- **Talmud daf**: "Zevachim 18" → "Zevachim 18:1", "Zevachim 18:2", etc.
- **Inter-chapter**: "Arukh HaShulchan, Orach Chaim 162:28-164:3"
- **Multiple separators**: `-`, `–`, `—`, `..`

## 🐛 Исправленные проблемы

### 1. HTML Entities
**Проблема**: `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;` в тексте
**Решение**: `html.unescape()` + `re.sub(r'\s+', ' ', text)`

### 2. Text Segmentation
**Проблема**: Диапазоны отображались как один блок
**Решение**: Парсинг диапазонов + индивидуальные API вызовы

### 3. Redis Keys
**Проблема**: Daily и Study чаты использовали одинаковые ключи
**Решение**: `daily:sess:{id}:*` vs `study:sess:{id}:*`

### 4. Background Loading
**Проблема**: Фоновая загрузка не запускалась
**Решение**: `asyncio.create_task()` с правильными параметрами

### 5. Session Persistence
**Проблема**: Daily reference не сохранялся
**Решение**: Сохранение в `daily:sess:{id}:top` при первом `set_focus`

## 📋 TODO / Будущие улучшения

### 1. Performance
- [ ] Кэширование daily calendar на 24 часа
- [ ] Предзагрузка популярных текстов
- [ ] Оптимизация фоновой загрузки

### 2. UX Improvements
- [ ] Progress tracking для daily sessions
- [ ] Streak counter (дни подряд)
- [ ] Daily notifications/reminders

### 3. Advanced Features
- [ ] Custom daily schedules
- [ ] Study groups/sharing
- [ ] Offline mode для daily texts

### 4. Analytics
- [ ] Time spent per daily session
- [ ] Completion rates
- [ ] Popular study patterns

## 🔍 Debugging

### Логи для отладки
```bash
# Daily mode detection
🔥 SESSION TYPE CHECK: is_daily_session=True (from flag: True, from session_id: True)

# Text segmentation
🔥 DAILY MODE: Loading first 10 segments from range 1-52
🔥 DAILY SEGMENT 1/10: Deuteronomy 32:1

# HTML cleaning
🔥 CLEANING HTML: before='text&nbsp;&nbsp;', after='text '

# Background loading
🔥 BACKGROUND LOADING: Deuteronomy 32, verses 11-52
```

### Redis Keys Structure
```
daily:sess:daily-2025-10-02-parashat-hashavua:top     # Daily reference
daily:sess:daily-2025-10-02-parashat-hashavua:history_list  # Chat history
study:sess:uuid-123:top                                # Study reference
study:sess:uuid-123:history_list                       # Study chat history
```

## 📝 Заключение

Daily Mode успешно реализован и интегрирован в существующую систему. Основные функции:

✅ **Автоматическое создание** daily сессий из Sefaria calendar  
✅ **Сегментированное отображение** текстов  
✅ **HTML text cleaning** без артефактов  
✅ **Полная навигация** между сегментами  
✅ **Chat history** для daily сессий  
✅ **Background loading** оставшихся сегментов  
✅ **Redis architecture** с раздельными keyspaces  

Система готова к использованию! 🎉






















