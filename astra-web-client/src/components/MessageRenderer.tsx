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
  if (!text) return [];

  // Сначала декодируем entities
  let t = decodeHtml(text);



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
          <code key={`c-${i}-${cm.index}`} className="bg-muted px-1 rounded text-[0.95em]" dir="ltr">
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
  const base = "mb-4 rounded-xl border px-4 py-3";
  switch (variant) {
    case "info":
      return `${base} border-sky-700 bg-sky-950/40`;
    case "warn":
      return `${base} border-amber-700 bg-amber-950/40`;
    case "success":
      return `${base} border-emerald-700 bg-emerald-950/40`;
    case "danger":
      return `${base} border-rose-700 bg-rose-950/40`;
    default:
      return `${base} border-border bg-muted/50`;
  }
}

interface MessageRendererProps {
  doc: Doc | DocV1;
}

export function MessageRenderer({ doc }: MessageRendererProps) {
  return (
    <div dir="auto" style={{ unicodeBidi: "plaintext" }}>
      {doc.blocks.map((rawBlock, index) => {
        // Handle cases where block data is nested inside a `data` property
        const block = (rawBlock as any).data ? { ...rawBlock, ...(rawBlock as any).data } : rawBlock;
        switch (block.type) {
          case "heading": {
            const lvl = Math.min(6, Math.max(1, Number(block.level) || 2));
            const HeadingTag = `h${lvl}` as keyof JSX.IntrinsicElements;
            return (
              <HeadingTag
                key={index}
                className="mt-6 mb-2 font-semibold tracking-tight"
                lang={block.lang}
                dir={block.dir || "auto"}
              >
                {block.text}
              </HeadingTag>
            );
          }

          case "paragraph": {
            const t = typeof block.text === "string" ? block.text : String(block.text ?? "");
            return (
              <p key={index} lang={block.lang} dir={block.dir || "auto"}>
                {renderMdLite(t)}
              </p>
            );
          }

          case "quote": {
            const t = typeof block.text === "string" ? block.text : String(block.text ?? "");
            return (
              <blockquote key={index} lang={block.lang} dir={block.dir || "auto"}>
                {renderMdLite(t)}
                {block.source && (
                  <cite className="block mt-2 text-sm text-neutral-400 not-italic">— {block.source}</cite>
                )}
              </blockquote>
            );
          }

          case "list":
            return block.ordered ? (
              <ol key={index}>
                {block.items?.map((item: string, itemIndex: number) => (
                  <li key={itemIndex}>{renderMdLite(typeof item === "string" ? item : String(item ?? ""))}</li>
                ))}
              </ol>
            ) : (
              <ul key={index}>
                {block.items?.map((item: string, itemIndex: number) => (
                  <li key={itemIndex}>{renderMdLite(typeof item === "string" ? item : String(item ?? ""))}</li>
                ))}
              </ul>
            );

          case "term":
            return (
              <div key={index} className="mb-3 term" lang="he" dir="rtl">
                <div className="term-title text-sm opacity-70">Термин</div>
                <div className="flex flex-wrap gap-x-1">
                  <span className="font-semibold">{block.he || block.text || '???'}</span>
                  {block.ru && (
                    <span dir="ltr" lang="ru" className="opacity-80">&nbsp;— {block.ru}</span>
                  )}
                  {block.en && (
                    <span dir="ltr" lang="en" className="opacity-60 text-xs">&nbsp;({block.en})</span>
                  )}
                </div>
                {block.translit && (
                  <div className="text-xs opacity-50 mt-1" dir="ltr">{block.translit}</div>
                )}
                {block.sense && (
                  <div className="text-sm opacity-80 mt-1" dir="ltr" lang="ru">{block.sense}</div>
                )}
                {block.notes && (
                  <div className="text-sm opacity-70 mt-2" dir="ltr" lang="ru">{renderMdLite(block.notes)}</div>
                )}
              </div>
            );

          case "callout":
            return (
              <div key={index} className={calloutClass(block.variant)}>
                {renderMdLite(block.text || "")}
              </div>
            );

          case "action":
            return (
              <button
                key={index}
                className="rounded-2xl px-4 py-2 border border-border hover:bg-accent"
                onClick={() => window.dispatchEvent(new CustomEvent("doc-action", { detail: block }))}
              >
                {block.label}
              </button>
            );

          case "code":
            return (
              <pre key={index}>
                <code lang={block.lang}>{block.code}</code>
              </pre>
            );

          case "hr":
            return <hr key={index} />;

          case "image":
            return (
              <figure key={index}>
                <img src={block.url} alt={block.alt || ""} />
                {block.caption && <figcaption>{renderMdLite(block.caption)}</figcaption>}
              </figure>
            );

          case "table":
            return (
              <table key={index}>
                {block.headers && block.headers.length > 0 && (
                  <thead>
                    <tr>
                      {block.headers.map((header: string, i: number) => (
                        <th key={i}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {block.rows?.map((row: string[], rowIndex: number) => (
                    <tr key={rowIndex}>
                      {row.map((cell: string, cellIndex: number) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );

          default:
            // Явно показываем неизвестные блоки в Dev
            if (process.env.NODE_ENV !== "production") {
              return (
                <div key={index} className="mb-4 rounded-xl border border-amber-700 bg-amber-950/20 px-3 py-2 text-sm">
                  Unsupported block <code>{String((block as any)?.type || "unknown")}</code>
                </div>
              );
            }
            return null;
        }
      })}
    </div>
  );
}
