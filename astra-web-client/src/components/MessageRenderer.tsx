import React from "react";
import { Doc, DocV1 } from "../types/text";

/** 1) Декодирование HTML entities */
function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 2) Безопасный escape */
/** 1) Безопасный escape */
// @ts-ignore
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 2.5) Рендер одного блока */
function renderBlock(block: any, key: string): React.ReactNode {
  switch (block.type) {
    case "heading": {
      const HeadingTag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
      return (
        <HeadingTag
          key={key}
          className="mt-6 mb-3 font-semibold"
          lang={block.lang}
          dir={block.dir || "auto"}
        >
          {block.text}
        </HeadingTag>
      );
    }

    case "paragraph":
      return (
        <p key={key} className="mb-4 leading-7" lang={block.lang} dir={block.dir || "auto"}>
          {renderMdLite(block.content || block.text || "")}
        </p>
      );

    case "quote":
      return (
        <blockquote
          key={key}
          className="mb-4 border-s-4 border-neutral-600 ps-4 italic"
          lang={block.lang}
          dir={block.dir || "auto"}
        >
          {block.content || block.text}
          {block.source && (
            <cite className="block mt-2 text-sm text-neutral-400 not-italic">— {block.source}</cite>
          )}
        </blockquote>
      );

    case "list":
      return block.ordered ? (
        <ol key={key} className="list-decimal ms-6 mb-4">
          {block.items?.map((item: string, itemIndex: number) => <li key={itemIndex}>{item}</li>)}
        </ol>
      ) : (
        <ul key={key} className="list-disc ms-6 mb-4">
          {block.items?.map((item: string, itemIndex: number) => <li key={itemIndex}>{item}</li>)}
        </ul>
      );

    case "term":
      return (
        <div key={key} className="mb-2">
          <span className="font-semibold" dir="rtl">
            {block.he}
          </span>{" "}
          — {block.ru}
        </div>
      );

    case "callout":
      return (
        <div key={key} className={`mb-4 rounded-2xl p-4 border ${calloutClass(block.variant)}`}>
          {block.content || block.text}
        </div>
      );

    case "action":
      return (
        <button
          key={key}
          className="mb-4 rounded-2xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800"
          onClick={() => window.dispatchEvent(new CustomEvent("doc-action", { detail: block }))}
        >
          {block.label}
        </button>
      );

    case "code":
      return (
        <pre
          key={key}
          className="mb-4 rounded-2xl p-4 bg-neutral-900 text-neutral-100 border border-neutral-700 overflow-auto"
        >
          <code lang={block.lang}>{block.code}</code>
        </pre>
      );

    default:
      return null;
  }
}

/** 3) md-lite: декодируем entities, эскейпим, возвращаем React-ноды */
/** 2) Валидация ссылок: разрешаем только https, http, mailto, tel */
function sanitizeHref(href: string): string | null {
  try {
    const url = new URL(href, "http://localhost"); // base для относительных (мы не используем относительные)
    const allowed = ["http:", "https:", "mailto:", "tel:"];
    if (!allowed.includes(url.protocol)) return null;
    return href;
  } catch {
    // Если URL не распарсился — отклоняем
    return null;
  }
}

/** 3) md-lite: декодируем entities, эскейпим, возвращаем React-ноды */
function renderMdLite(text: string): React.ReactNode[] {
  if (!text) return [null];

  // Сначала декодируем entities
  let t = decodeHtml(text);

  // Если текст — JSON с blocks, рендерим как doc
  try {
    const parsed = JSON.parse(t);
    if (parsed.blocks && Array.isArray(parsed.blocks)) {
      const blocks = [...parsed.blocks];
      if (parsed.callout) {
        blocks.push(parsed.callout);
      }
      return blocks.map((block: any, idx: number) => renderBlock(block, `json-${idx}`));
    }
  } catch {}

  // Иначе рендерим как md (уже декодирован, не нужно повторно эскейпить)

  // Ссылки [text](url) -> <a>
  // Делаем в несколько проходов: вырезаем ссылки, собираем ноды
  const nodes: React.ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = linkRegex.exec(t)) !== null) {
    const before = t.slice(lastIndex, m.index);
    if (before) nodes.push(<span key={`t-${lastIndex}`}>{before}</span>);

    const label = m[1];
    const hrefRaw = m[2];
    const safeHref = sanitizeHref(hrefRaw);
    if (safeHref) {
      nodes.push(
        <a
          key={`a-${m.index}`}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 underline-offset-2 hover:underline focus:underline"
        >
          {label}
        </a>
      );
    } else {
      // Если ссылка невалидна, вывести как простой текст
      nodes.push(<span key={`bad-${m.index}`}>[{label}]({hrefRaw})</span>);
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < t.length) nodes.push(<span key={`t-end`}>{t.slice(lastIndex)}</span>);

  // Теперь inline code `` -> <code>
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (typeof node === "string" || (React.isValidElement(node) && typeof node.props.children === "string")) {
      const raw = typeof node === "string" ? node : (node.props.children as string);
      const parts: React.ReactNode[] = [];
      const codeRegex = /`([^`]+)`/g;
      let j = 0;
      let cm: RegExpExecArray | null;
      while ((cm = codeRegex.exec(raw)) !== null) {
        const before = raw.slice(j, cm.index);
        if (before) parts.push(before);
        parts.push(
          <code key={`c-${i}-${cm.index}`} className="bg-neutral-800 px-1 rounded text-[0.95em]" dir="ltr">
            {cm[1]}
          </code>
        );
        j = cm.index + cm[0].length;
      }
      if (j < raw.length) parts.push(raw.slice(j));
      nodes[i] = React.isValidElement(node) ? React.cloneElement(node, {}, parts) : (parts as any);
    }
  }

  // Затем **bold** и *italic* — применяем к простым текстовым участкам
  function applyStrongEm(child: React.ReactNode, keyPrefix: string): React.ReactNode {
    if (typeof child !== "string") return child;
    let rest = child;

    // Сначала bold
    const strongRegex = /\*\*(.+?)\*\*/g;
    let si = 0;
    let sm: RegExpExecArray | null;
    const strongParts: React.ReactNode[] = [];
    while ((sm = strongRegex.exec(rest)) !== null) {
      const before = rest.slice(si, sm.index);
      if (before) strongParts.push(before);
      strongParts.push(<strong key={`${keyPrefix}-b-${sm.index}`}>{sm[1]}</strong>);
      si = sm.index + sm[0].length;
    }
    if (si < rest.length) strongParts.push(rest.slice(si));

    // Затем italic
    const finalParts: React.ReactNode[] = [];
    const italicRegex = /\*(.+?)\*/g;
    strongParts.forEach((p, idx) => {
      if (typeof p !== "string") return finalParts.push(p);
      let ii = 0;
      let im: RegExpExecArray | null;
      while ((im = italicRegex.exec(p)) !== null) {
        const before = p.slice(ii, im.index);
        if (before) finalParts.push(before);
        finalParts.push(<em key={`${keyPrefix}-i-${idx}-${im.index}`}>{im[1]}</em>);
        ii = im.index + im[0].length;
      }
      if (ii < p.length) finalParts.push(p.slice(ii));
    });

    return finalParts.length ? finalParts : child;
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (typeof n === "string") nodes[i] = applyStrongEm(n, `n-${i}`);
    else if (React.isValidElement(n)) {
      const kids = React.Children.toArray(n.props.children).map((k, idx) =>
        applyStrongEm(k as React.ReactNode, `k-${i}-${idx}`)
      );
      nodes[i] = React.cloneElement(n, {}, kids);
    }
  }

  return nodes;
}

/** 4) Вспомогательные классы для callout в тёмной теме */
function calloutClass(variant?: string): string {
  switch (variant) {
    case "info":
      return "border-sky-700 bg-sky-950/40";
    case "warn":
      return "border-amber-700 bg-amber-950/40";
    case "success":
      return "border-emerald-700 bg-emerald-950/40";
    case "danger":
      return "border-rose-700 bg-rose-950/40";
    default:
      return "border-neutral-700 bg-neutral-900/60";
  }
}

interface MessageRendererProps {
  doc: Doc | DocV1;
}

export function MessageRenderer({ doc }: MessageRendererProps) {
  return (
    <div dir="auto" style={{ unicodeBidi: "plaintext" }}>
      {doc.blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const HeadingTag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
            return (
              <HeadingTag
                key={index}
                className="mt-6 mb-3 font-semibold"
                lang={block.lang}
                dir={block.dir || "auto"}
              >
                {block.text}
              </HeadingTag>
            );
          }

          case "paragraph":
            return (
              <p key={index} className="mb-4 leading-7" lang={block.lang} dir={block.dir || "auto"}>
                {renderMdLite(block.text || "")}
              </p>
            );

          case "quote":
            return (
              <blockquote
                key={index}
                className="mb-4 border-s-4 border-neutral-600 ps-4 italic"
                lang={block.lang}
                dir={block.dir || "auto"}
              >
                {block.text}
                {block.source && (
                  <cite className="block mt-2 text-sm text-neutral-400 not-italic">— {block.source}</cite>
                )}
              </blockquote>
            );

          case "list":
            return block.ordered ? (
              <ol key={index} className="list-decimal ms-6 mb-4">
                {block.items?.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
              </ol>
            ) : (
              <ul key={index} className="list-disc ms-6 mb-4">
                {block.items?.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
              </ul>
            );

          case "term":
            return (
              <div key={index} className="mb-2">
                <span className="font-semibold" dir="rtl">
                  {block.he}
                </span>{" "}
                — {block.ru}
              </div>
            );

          case "callout":
            return (
              <div key={index} className={`mb-4 rounded-2xl p-4 border ${calloutClass(block.variant)}`}>
                {block.text}
              </div>
            );

          case "action":
            return (
              <button
                key={index}
                className="mb-4 rounded-2xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800"
                onClick={() => window.dispatchEvent(new CustomEvent("doc-action", { detail: block }))}
              >
                {block.label}
              </button>
            );

          case "code":
            return (
              <pre
                key={index}
                className="mb-4 rounded-2xl p-4 bg-neutral-900 text-neutral-100 border border-neutral-700 overflow-auto"
              >
                <code lang={block.lang}>{block.code}</code>
              </pre>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
