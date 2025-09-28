# doc.v1 Message Format

This document describes the canonical `doc.v1` message format used by the brain service when returning structured chat content (study mode streams, future deep-research responses, etc.). The same format is delivered over both HTTP streaming (`/chat/stream`, `/study/chat`) and historical fetches (`/chats/{id}`).

---

## Envelope

Each message item emitted by the backend follows the `ChatMessage` shape:

```jsonc
{
  "id": "evt_123",
  "role": "assistant",              // 'assistant' | 'user' | 'system' | 'source'
  "timestamp": 1727356800000,         // milliseconds since epoch
  "content_type": "doc.v1",          // 'doc.v1' | 'text.v1'
  "content": { ... },                 // DocV1 object when content_type === 'doc.v1'
  "meta": { ... }                     // optional metadata (tool traces, UI hints)
}
```

- `content_type` is the contract switch.
  - `text.v1` → `content` is a plain UTF-8 string (legacy mode).
  - `doc.v1` → `content` is a structured document, described below.
- When the backend streams chunks, events are framed as NDJSON with `type` + `data`; consumers convert them to the structure above before storage.

---

## DocV1 Core

```jsonc
{
  "version": "1.0",
  "ops": [ ... ],          // optional execution trace / tool intents
  "blocks": [ ... ]        // ordered list of renderable blocks
}
```

- `version` remains `"1.0"` until we introduce breaking changes.
- `ops` is optional and captures tool usage instructions (e.g., fetch Sefaria links). The current frontend can ignore it; future flows will inspect it to prefetch or display inline actions.
- `blocks` is the primary render payload. Blocks are rendered sequentially; the UI should respect order and spacing.

### Block Types

| Type        | Interface (properties) | Rendering guidance |
|-------------|------------------------|--------------------|
| `heading`   | `{ level: 1-6, text, lang?, dir? }` | Render as `<h{level}>`. Respect `dir`/`lang` for RTL languages. |
| `paragraph` | `{ text, lang?, dir? }` | Render as `<p>`. Apply **md-lite** (`**bold**`, `*italic*`, ``code``, `[link](url)`). Do not allow raw HTML. |
| `quote`     | `{ text, source?, lang?, dir? }` | Render as `<blockquote>`. Append citation if `source` present. |
| `list`      | `{ ordered?, items[] }` | `<ol>` when `ordered`, otherwise `<ul>`. Each `item` is md-lite text. |
| `term`      | `{ he, ru?, en?, description? }` | Definition row. Keep Hebrew (`he`) RTL. Optional translations/notes may appear. |
| `callout`   | `{ variant, text }` | Styled alert box. Supported variants: `info`, `warn`, `success`, `danger`. |
| `action`    | `{ label, actionId, params? }` | Button or link. Emit browser event `doc-action` with payload so host app handles it. |
| `code`      | `{ code, lang? }` | `<pre><code>` with monospace font. Syntax highlighting optional. |

Additional blocks can be introduced in the future. Consumers should gracefully ignore unknown `type` values (log + skip) to forward-proof the UI.

### md-lite Syntax

We intentionally use a constrained markdown subset to avoid injecting raw HTML:

- Bold: `**text**`
- Italic: `*text*`
- Code span: `` `text` ``
- Links: `[label](https://example.com)`

Any additional markdown tokens should be escaped; renderers must not evaluate HTML tags.

### Ops (Tool Instructions)

Example:

```jsonc
{
  "ops": [
    { "op": "links", "tref": "Shabbat 2a:1" },
    { "op": "text", "tref": "Shabbat 2a:1" }
  ]
}
```

- `op` values correspond to backend tools (e.g., Sefaria lookup, recall). They are advisory; the UI can surface them ("Open source", etc.) or prefetch context.
- For now, ops are informational. When we formalize interactive flows, ops will map to front-end triggers.

---

## Examples

### Minimal paragraph

```jsonc
{
  "version": "1.0",
  "blocks": [
    { "type": "paragraph", "text": "Привет!" }
  ]
}
```

### Study response snippet

```jsonc
{
  "version": "1.0",
  "ops": [ { "op": "text", "tref": "Shabbat 2b:2" } ],
  "blocks": [
    { "type": "quote", "lang": "he", "dir": "rtl", "text": "מַרְאוֹת נְגָעִים, שְׁנַיִם שֶׁהֵן אַרְבָּעָה." },
    { "type": "paragraph", "text": "Этот отрывок из Мишны ..." },
    { "type": "list", "items": ["Негайм – библейское заболевание кожи..."] },
    { "type": "term", "he": "מַרְאוֹת נְגָעִים", "ru": "Зеркала для негайм" },
    { "type": "callout", "variant": "info", "text": "Этот пункт подчёркивает..." }
  ]
}
```

---

## Versioning & Compatibility

- **Forward compatibility:** Additive changes (new block fields, new block types) should not break existing renderers; ensure unknown fields are ignored.
- **Breaking changes:** Increment `version` (e.g., `1.1`) and include a `compat` block in API responses. Document any breaking change here before rollout.
- **Testing:** The backend test suite includes fixtures under `brain/tests/doc_v1_samples/`; front-end snapshots should mirror representative payloads.

---

## Useful Types (TypeScript)

```ts
export type Block =
  | HeadingBlock
  | ParagraphBlock
  | QuoteBlock
  | ListBlock
  | TermBlock
  | CalloutBlock
  | ActionBlock
  | CodeBlock;

type Variant = 'info' | 'warn' | 'success' | 'danger';
// ... refer to src/types/text.ts for the full definitions.
```

The canonical definitions live in `astra-web-client/src/types/text.ts` and are safe to import across the UI.

---

## References

- `brain/main.py` – emits doc.v1 payloads for study chat.
- `astra-web-client/src/components/MessageRenderer.tsx` – reference renderer implementation.
- `frontend_doc_v1_instructions.md` – legacy instructions (superseded by this document).

