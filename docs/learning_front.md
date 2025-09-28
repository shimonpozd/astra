# Frontend Implementation Guide: Study Desk v1 & v2 Plan

This guide outlines the frontend tasks required to build the "Study Desk" interface.

---

## V1 IMPLEMENTATION

### Core Concept
The goal is to build an interactive "Study Desk" with several components: a Text Viewer, a Bookshelf, a navigation History (Breadcrumbs), and a focused Chat. The entire UI state is driven by a `StudySnapshot` object returned from the backend.

### The `StudySnapshot` Object
This is the single source of truth for the UI. It is returned by the `/set_focus`, `/back`, `/forward`, and `/restore` endpoints.
```json
{
  "focus": { "ref": "...", "title": "...", "text_full": "...", "collection": "..." },
  "window": {
    "prev": [ { "ref":"...", "preview":"..." }, ... ],
    "next": [ { "ref":"...", "preview":"..." }, ... ]
  },
  "bookshelf": {
    "counts": { "Commentary": 12, ... },
    "items": [ { "ref": "...", "title": "...", "category": "...", "commentator": "...", "preview": "..." }, ... ]
  },
  "chat_local": [ {"role":"user","content":"..."}, ... ],
  "ts": 1732451000
}
```

### 1. Initial Text Selection (Entry Point)

*   **UI:** Create an input field where the user can type a reference (e.g., "Shabbat 21a").
*   **Action:** On submit, send the user's query (as `{ "text": "..." }`) to the **`POST /study/resolve`** endpoint.
*   **Response Handling:**
    *   If `ok: true`, you will receive a canonical `ref`. Proceed to Step 2.
    *   If `ok: false`, display an error or show the `candidates` list.

### 2. Building the Study Desk (Setting Focus)

*   **Action:** Once you have a canonical `ref`, call **`POST /study/set_focus`**. This is the primary action for all navigation.
*   **Request Body & `navigation_type` (IMPORTANT):**
    *   Use `"drill_down"` (default) when the user is going deeper: setting the first focus, clicking a commentator, or clicking a link to a different text.
    *   Use `"advance"` when the user is moving sequentially: clicking "next"/"previous" in the context window.
    ```json
    {
      "session_id": "...",
      "ref": "THE_CANONICAL_REF",
      "navigation_type": "drill_down" 
    }
    ```
*   **Response Handling:** The backend returns the `StudySnapshot`. Use this to render the entire UI.

### 3. Rendering the Study Desk Components

*   **Text Viewer (Focus + Context Window):**
    *   Render `state.focus.text_full` as the main text.
    *   Render `state.window.prev` and `state.window.next` items above and below the focus text, styled differently (e.g., `opacity-70`).

*   **Bookshelf (with Previews):**
    *   Use `state.bookshelf.items` to render the list.
    *   Use `state.bookshelf.counts` to render filter tabs.
    *   Display the `item.preview` field, which contains the first few lines of the commentary text.

### 4. Navigation

*   **Back/Forward Buttons:** Call **`POST /study/back`** and **`POST /study/forward`**. Both return a new `StudySnapshot`.
*   **"Study Path" (Breadcrumbs):** Maintain a client-side list of `focus.ref`s to build the breadcrumb trail. A click should call **`POST /study/restore`** with the appropriate `index`.

### 5. Focused Chat

*   **Action:** When the user sends a message in the Study Desk UI, call **`POST /study/chat`**.
*   **Response Handling:** This is a streaming endpoint that yields `llm_chunk` events.

### 6. Interacting with the Desk

*   **Clicking a commentator or a link in the text:** This is a navigation action. Get the `ref` and call **`POST /study/set_focus`** (typically with `navigation_type: "drill_down"`).

---

## V2 PLAN - NEW TASKS

### 1. Lexicon (Dictionary) Popup

*   **Concept:** Allow the user to double-click any word to see its dictionary definition in a popup window.
*   **UI Action:**
    1.  Implement an `onDoubleClick` event handler on all text containers (focus text, context window, and bookshelf previews).
    2.  When the event fires, get the selected word using a method like `window.getSelection().toString().trim()`.
    3.  If a word is selected, call the lexicon API endpoint.
*   **API Call:**
    *   Make a `GET` request to the **`/study/lexicon?word=<SELECTED_WORD>`** endpoint.
    *   **Example:** `GET /study/lexicon?word=תַּנְיָא`
*   **Response Handling & Display:**
    *   The backend will proxy the request and return a JSON array of lexicon entries from the Sefaria API.
    *   On successful response, display a modal (popup) window.
    *   The modal should show the word as a title and list the definitions. The primary definition is usually found in `content.senses[0].definition`.
    *   If the API returns an empty array or an error, the modal should indicate that no definition was found.

---

### Lexicon – Current Status (2025‑09‑24)

- Backend endpoint exists and works: `GET /study/lexicon?word=<WORD>` (proxies Sefaria API).
- Frontend baseline implemented on Study Desk: double‑click on prev/focus/next opens a modal and queries the endpoint.

Known issues to address:
- Double‑click selection can be empty depending on the DOM structure; added caret‑range fallback, but needs wider testing across browsers.
- Hebrew niqqud/punctuation need normalization before querying (basic strip added; refine rules if needed).
- Some text blocks may not allow selection by default — ensure `user-select: text` (Tailwind `select-text`) is applied on all content blocks.
- Overlaying layers (z-index) previously swallowed events; current Grid layout avoids overlap, but verify after layout changes.

Next steps:
- Add visual feedback (highlight the selected word) before opening the modal.
- Add keyboard close (Esc) and click‑outside handling (done) with focus trap for accessibility.
- Expand modal to render multiple `senses`, source dict name, and a link to Sefaria entry.
- Port the same logic to Inline Study (chat center wheel).

### 2. Workbench (Comparison Panels) & Dynamic Bookshelf

*   **Concept:** Create a powerful comparison tool by allowing the user to place two different texts (commentaries) in side panels next to the main focus text. The chat context and the bookshelf will dynamically update based on which text the user selects.

*   **New State Fields:** The `StudySnapshot` object now contains two new fields:
    *   `workbench: { left: BookshelfItem | null, right: BookshelfItem | null }`: Holds the data for the items in the side panels.
    *   `discussion_focus_ref: string`: The `ref` of the text currently selected for discussion (can be the main focus, or the left/right workbench item).

*   **UI Actions & API Calls:**

    1.  **Render Panels:**
        *   Create two new UI panels/columns, one on each side of the main Text Viewer.
        *   If `snapshot.workbench.left` is not null, render its content (e.g., `title`, `commentator`, `preview`) in the left panel. Do the same for the right panel.

    2.  **Implement Drag-and-Drop:**
        *   Make items in the `Bookshelf` draggable.
        *   Make the two new panels drop targets.
        *   **On Drop:** Call **`POST /study/workbench/set`** with the `session_id`, the `slot` (`"left"` or `"right"`), and the `ref` of the dropped item.
        *   **Response:** The backend returns a new `StudySnapshot`. Re-render the UI to show the item in the correct panel.

    4.  **Clearing a Panel:**
        *   To remove an item from a panel (e.g., on a 'close' button click), call the same **`POST /study/workbench/set`** endpoint for the correct `slot`, but set the `ref` to `null`.
        *   **Request Body:** `{ "session_id": "...", "slot": "left", "ref": null }`
        *   This will empty the slot in the state. Re-render the UI accordingly.

    3.  **Implement Context Switching (IMPORTANT):**
        *   Add `onClick` handlers to the main Text Viewer, the left panel, and the right panel.
        *   **On Click:** Call **`POST /study/chat/set_focus`** with the `session_id` and the `ref` of the clicked item (e.g., `snapshot.focus.ref` or `snapshot.workbench.left.ref`).
        *   **Response & Re-rendering:** The backend returns a new `StudySnapshot`. You **must** re-render the UI with this new state:
            *   Update the visual highlighting to show which panel is active (the one whose `ref` matches `snapshot.discussion_focus_ref`).
            *   **Crucially, the `snapshot.bookshelf` will be completely different.** You must replace the entire bookshelf component with the new items relevant to the new focus.

### 3. Пример реализации Drag-and-Drop (React)

Вот базовый пример, иллюстрирующий, как можно реализовать drag-and-drop с использованием нативного HTML API в React. Этот код можно адаптировать для вашего проекта.

**Шаг 1: Сделать элементы в "книжной полке" перетаскиваемыми**

Создайте компонент для элемента книжной полки. В `onDragStart` мы сохраняем `ref` элемента, который хотим переместить.

```tsx
// D:\AI\astra\astra-web-client\src\components\DraggableBookshelfItem.tsx

import React from 'react';

// Предполагаем, что тип BookshelfItem импортирован
import { BookshelfItem } from './types'; 

interface Props {
  item: BookshelfItem;
}

export const DraggableBookshelfItem: React.FC<Props> = ({ item }) => {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    // Сохраняем 'ref' элемента в данных перетаскивания
    event.dataTransfer.setData('application/json', JSON.stringify({ ref: item.ref }));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      className="p-2 border rounded cursor-grab active:cursor-grabbing"
    >
      <h4 className="font-bold">{item.title}</h4>
      <p className="text-sm opacity-80">{item.preview}</p>
    </div>
  );
};
```

**Шаг 2: Создать "слоты" для сброса в рабочей области**

Создайте компонент для слотов "left" и "right". Он будет обрабатывать события `onDragOver` и `onDrop`.

```tsx
// D:\AI\astra\astra-web-client\src\components\WorkbenchSlot.tsx

import React, { useState } from 'react';

// Предполагаем, что типы импортированы
import { BookshelfItem, StudySnapshot } from './types';

interface Props {
  slotId: 'left' | 'right';
  item: BookshelfItem | null;
  sessionId: string;
  // Функция для обновления всего состояния из родительского компонента
  onStateUpdate: (newState: StudySnapshot) => void; 
}

export const WorkbenchSlot: React.FC<Props> = ({ slotId, item, sessionId, onStateUpdate }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Обязательно, чтобы разрешить drop
    event.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const data = event.dataTransfer.getData('application/json');
    if (!data) return;

    const { ref } = JSON.parse(data);
    if (!ref) return;

    // --- Вызов API ---
    try {
      const response = await fetch('/study/workbench/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          slot: slotId,
          ref: ref,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update workbench');
      }

      const result = await response.json();
      if (result.ok && result.state) {
        // Вызываем колбэк для обновления состояния на верхнем уровне
        onStateUpdate(result.state);
      }
    } catch (error) {
      console.error('Error setting workbench item:', error);
    }
  };

  const slotClasses = `p-4 border-2 border-dashed rounded-lg transition-colors ${
    isDragOver ? 'border-blue-500 bg-blue-100' : 'border-gray-300'
  }`;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={slotClasses}
    >
      {item ? (
        <div>
          <h3 className="font-bold">{item.title}</h3>
          <p>{item.preview}</p>
        </div>
      ) : (
        <p className="text-gray-500">Drop commentary here</p>
      )}
    </div>
  );
};
```
Этот пример показывает основной механизм. Фронтенд-разработчику нужно будет интегрировать эти компоненты в общую структуру приложения и передать им необходимые `props` (такие как `sessionId` и `onStateUpdate`).
