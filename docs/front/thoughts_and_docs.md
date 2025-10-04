# Frontend/Backend: Handling Thoughts and Structured Documents

This document outlines the implementation for handling complex LLM responses that contain both a "thought process" and a structured `doc.v1` document.

## 1. Goal

The objective is to gracefully handle LLM responses that include a `<think>...</think>` block before the final structured JSON output. The system should be able to display both parts of the response to the user in a distinct and readable way, preserving the streaming experience.

## 2. Backend Implementation (`brain/main.py`)

The core logic resides in the `study_chat_stream_processor` function.

### 2.1. Response Parsing

After the full response from the LLM is received as a single string, the backend performs the following steps:

1.  **Regex Extraction:** A regular expression (`<think>(.*?)</think>`) is used to find and extract the content of the `<think>` block.
2.  **Content Separation:** The original response string is split into two parts: the `think_content` and the remaining `doc_content_str`.

### 2.2. Message Creation

Instead of saving a single assistant message, the backend now creates and saves a sequence of messages to the `chat_local` history:

1.  The original **user message** is saved first.
2.  If `think_content` was extracted, a new assistant message is created with:
    -   `content`: The text from inside the `<think>` block.
    -   `content_type`: A new type, `'thought.v1'`.
3.  The backend then attempts to parse the `doc_content_str` as JSON and validate it as a `DocV1` object.
    -   If successful, a new assistant message is created with the parsed object as `content` and `content_type: 'doc.v1'`.
    -   If parsing or validation fails, a final assistant message is created with the raw `doc_content_str` as `content` and `content_type: 'text.v1'` as a fallback.

This ensures that the chat history in Redis is a clean, ordered representation of the conversation, with thoughts and structured documents stored as separate, typed messages.

## 3. Frontend Implementation

### 3.1. Type Definition

The `Message` and `ChatMessage` types in `src/services/api.ts` and `src/types/text.ts` have been updated to include `'thought.v1'` as a valid `content_type`.

### 3.2. Rendering (`ChatViewport.tsx`)

The component now has specific logic to handle the new message type:

1.  Inside the `messages.map` loop, a new `else if` condition checks for `contentType === 'thought.v1'`. 
2.  If a message has this type, it is rendered with a distinct style to differentiate it from regular user and assistant messages. The current implementation uses:
    -   A smaller, italic font.
    -   A semi-transparent, dark background.
    -   This makes the "thought" block appear as a de-emphasized, meta-commentary on the main response.
3.  The existing logic for rendering `doc.v1` and `text.v1` messages remains unchanged, and it will correctly render the structured document that follows the thought.

This separation of concerns allows the frontend to present a clear and intuitive view of the LLM's entire response, fulfilling the user's request to see both the thought process and the final, formatted output.
