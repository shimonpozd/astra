
# Frontend Instructions for `doc.v1` Message Format

This document outlines the changes required on the frontend to support the new `doc.v1` structured message format, which is now used in the study mode chat.

## 1. New Message Structure

The chat messages received from the `/study/chat` endpoint will now have a more structured format. The `content` of a message is no longer just a plain text string. Instead, you will receive a `ChatMessage` object with the following structure:

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  created_at: string; // ISO 8601 format
  content_type: 'doc.v1' | 'text.v1';
  content: DocV1 | string;
  meta?: { ... };
}
```

- **`content_type`**: This new field indicates the format of the `content`.
  - `'text.v1'`: The content is a plain text string (legacy format).
  - `'doc.v1'`: The content is a structured `DocV1` object.
- **`content`**: This field contains the actual message content, which can be either a string or a `DocV1` object.

## 2. Handling `doc.v1` Content

When you receive a message with `content_type: 'doc.v1'`, the `content` field will be a `DocV1` object with the following structure:

```typescript
interface DocV1 {
  version: '1.0';
  ops?: Op[]; // Optional array of operations for tool calls
  blocks: Block[]; // Array of content blocks to be rendered
}
```

Your main task is to parse the `blocks` array and render the content blocks accordingly.

### Rendering Content Blocks

The `blocks` array contains a list of different block types. You will need to create a component for each block type.

Here are the different block types and how to render them:

#### `heading`

```typescript
interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  lang?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
}
```

- **Render as**: `<h1>`, `<h2>`, etc., based on the `level`.
- **RTL Support**: Use the `lang` and `dir` attributes to handle right-to-left text (e.g., for Hebrew).

#### `paragraph`

```typescript
interface ParagraphBlock {
  type: 'paragraph';
  text: string;
  lang?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
}
```

- **Render as**: A `<p>` tag.
- **Markdown Support**: The `text` field supports a lightweight version of Markdown (`md-lite`): `**bold**`, `*italic*`, `code`, `[link](url)`.

#### `quote`

```typescript
interface QuoteBlock {
  type: 'quote';
  text: string;
  source?: string;
  lang?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
}
```

- **Render as**: A `<blockquote>` element. If `source` is provided, you can display it as a citation.

#### `list`

```typescript
interface ListBlock {
  type: 'list';
  ordered?: boolean;
  items: string[];
}
```

- **Render as**: A `<ul>` or `<ol>` list, depending on the `ordered` flag.

#### `term`

```typescript
interface TermBlock {
  type: 'term';
  he: string; // Hebrew term
  ru?: string; // Russian translation
}
```

- **Render as**: A definition list (`<dl>`) or a similar component to display a term and its translation.

#### `callout`

```typescript
interface CalloutBlock {
  type: 'callout';
  variant: 'info' | 'warn' | 'success' | 'danger';
  text: string;
}
```

- **Render as**: A styled box or alert component, with colors corresponding to the `variant`.

#### `action`

```typescript
interface ActionBlock {
  type: 'action';
  label: string;
  actionId: string;
  params?: Record<string, unknown>;
}
```

- **Render as**: A button with the given `label`. Clicking the button should trigger the action specified by `actionId`.

#### `code`

```typescript
interface CodeBlock {
  type: 'code';
  lang?: string;
  code: string;
}
```

- **Render as**: A preformatted code block (`<pre><code>`). You can use a syntax highlighting library if you wish.

## 3. Handling `ops` (Future)

The `ops` array in the `DocV1` object is reserved for future use. It will contain instructions for the frontend to execute tool calls. For now, you can ignore this field.

## 4. Streaming (Future)

Currently, you will receive the entire `DocV1` object in a single message. In the future, we plan to stream the content as deltas to improve perceived performance. We will provide updated instructions when this is implemented.

## Example `doc.v1` Message

Here is an example of a `ChatMessage` with `doc.v1` content:

```json
{
  "id": "msg_123",
  "role": "assistant",
  "created_at": "2025-09-25T10:00:00Z",
  "content_type": "doc.v1",
  "content": {
    "version": "1.0",
    "blocks": [
      {
        "type": "heading",
        "level": 2,
        "text": "Mishnah Berakhot 1:1"
      },
      {
        "type": "quote",
        "text": "מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בְּעַרְבִית? מִשָּׁעָה שֶׁהַכֹּהֲנִים נִכְנָסִים לֶאֱכֹל בִּתְרוּמָתָן...",
        "source": "Mishnah Berakhot 1:1",
        "lang": "he",
        "dir": "rtl"
      },
      {
        "type": "paragraph",
        "text": "From when do we recite the Shema in the evening? From the time that the priests enter to eat their terumah..."
      },
      {
        "type": "list",
        "ordered": false,
        "items": [
          "The first opinion is from Rabbi Eliezer.",
          "The Sages say until midnight."
        ]
      }
    ]
  }
}
```
