# Руководство по обработке стриминга в `brain` API

Этот документ подробно описывает два основных сценария потоковой передачи данных от бэкенда и как их обрабатывать на фронтенде.

## Сценарий 1: Стриминг источников (режим `/research`)

**Цель:** Показать пользователю в реальном времени, какие источники (тексты, комментарии) бэкенд анализирует в процессе исследования.

**Когда используется:** Только для запросов, начинающихся с команды `/research`.

### Формат потока

В этом режиме весь поток состоит из **чистых NDJSON** объектов. Каждая строка — это валидный JSON-объект.

```
{"type": "plan", "data": {...}}
{"type": "source", "data": {...}}
{"type": "status", "data": {...}}
{"type": "source", "data": {...}}
...
```

### Ключевое событие: `source`

Для отображения панели источников вас интересует только одно событие:

```json
{
  "type": "source",
  "data": {
    "id": "source-a1b2c3d4-…",
    "author": "Rashi",
    "book": "Genesis",
    "reference": "Rashi on Genesis 1:1",
    "text": "In the beginning…",
    "url": "https://sefaria.org/Rashi_on_Genesis.1.1",
    "ui_color": "#ff7f0e",
    "lang": "en",
    "heRef": "рш"י על בראשית א:א"
  }
}
```

### Логика фронтенда

1.  Отправить `POST` запрос на `/chat/stream` с текстом, начинающимся с `/research`.
2.  Начать читать тело ответа (stream) построчно.
3.  Каждую полученную строку парсить как JSON (`JSON.parse(line)`).
4.  Проверить `type` объекта. Если `type === 'source'`, добавить объект из поля `data` в массив источников в вашем React-состоянии.
5.  UI должен автоматически обновиться, отобразив новую карточку источника.

### Пример кода (только для `/research`)

```javascript
async function displayResearchSources(researchQuery) {
  const [sources, setSources] = useState([]); // React state

  const response = await fetch('http://localhost:7030/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: researchQuery, user_id: 'web_user', agent_id: 'chevruta_deepresearch' })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const event = JSON.parse(line);
        if (event.type === 'source') {
          console.log('Получен новый источник:', event.data);
          // Добавляем новый источник в состояние для отображения
          setSources(prev => [...prev, event.data]);
        }
      } catch (error) {
        // В режиме /research все сообщения должны быть JSON, 
        // поэтому ошибки парсинга стоит логировать.
        console.error('Ошибка парсинга JSON в режиме /research:', line);
      }
    }
  }
}
```

---

## Сценарий 2: Стриминг сгенерированного текста (Обычный чат)

**Цель:** Показать ответ ассистента с эффектом "пишущей машинки".

**Когда используется:** Для всех запросов, которые **не** начинаются с `/research`.

### Формат потока

В этом режиме поток **смешанный**: он содержит как простой текст, так и JSON.

1.  **Сначала:** Идет последовательность сообщений с "сырым" текстом (raw text). Это просто строки, не обернутые в JSON.
2.  **В конце:** Приходит одно финальное JSON-сообщение, сигнализирующее о завершении ответа.

*   **Пример смешанного потока:**
    ```
    Конечно
    , вот анекдот
    : 
     Почему программисты
     путают Хэллоуин и Рождество
    ? Потому что OCT 31 == DEC 25.
    {"type":"draft","data":{"draft":"Конечно, вот анекдот: Почему программисты путают Хэллоуин и Рождество? Потому что OCT 31 == DEC 25.","flow":"conversational"}}
    ```

### Логика фронтенда

Ключевая идея — обрабатывать каждую строку в блоке `try...catch`.

1.  Отправить `POST` запрос на `/chat/stream`.
2.  Начать читать тело ответа (stream) построчно.
3.  Для каждой строки:
    *   Попробовать выполнить `JSON.parse(line)`.
    *   **Если `catch` сработал (ошибка парсинга):** Это означает, что строка — это просто кусок текста. Его нужно немедленно добавить к строке ответа, отображаемой в UI.
    *   **Если `try` выполнился успешно:** Это финальное JSON-сообщение. Нужно взять полный текст из `event.data.draft` и заменить им весь "напечатанный" по кусочкам текст. Это гарантирует, что у вас будет финальная, чистая версия ответа.

### Пример кода (для обычного чата)

Этот код был в основной документации и полностью решает эту задачу.

```javascript
async function sendMessageAndDisplayResponse(messageText) {
  const responseContainer = document.getElementById('assistant-response');
  responseContainer.innerText = "";

  const response = await fetch('http://localhost:7030/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: messageText, user_id: 'web_user', agent_id: 'default' })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);
        if (event.type === 'draft' && event.data.draft) {
          console.log("Финальный полный ответ:", event.data.draft);
          responseContainer.innerText = event.data.draft;
        }
      } catch (error) {
        const textChunk = line;
        console.log("Получен кусок текста:", textChunk);
        responseContainer.innerText += textChunk;
      }
    }
  }
  
  if (buffer.trim()) {
      responseContainer.innerText += buffer;
  }
}
```

```