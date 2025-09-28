#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
extract_chat_facts_v2_1.py

Версия 2.1: читает .env, поддерживает переменные окружения, DRY_RUN, фиксированные чанки
(CHUNK_SIZE/STRIDE) или динамические, локализуемые промпты, гибкие фильтры и вывод в заданные пути.
"""

import os
import re
import json
import uuid
import hashlib
import argparse
from collections import Counter
from datetime import timedelta
from pathlib import Path
import pandas as pd
from math import ceil
from tqdm import tqdm

# --- .env -------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    load_dotenv()  # подтянет переменные из .env, если файл есть
except Exception:
    pass

# --- ENV / defaults ---------------------------------------------------------

def _env(name, default=None, cast=None):
    v = os.getenv(name, default)
    if cast and v is not None:
        try: return cast(v)
        except Exception: return default
    return v

# Провайдеры
LLM_PROVIDER     = _env("LLM_PROVIDER", "openai")
LLM_MODEL_NAME   = _env("LLM_MODEL_NAME", "gpt-4o-mini")
OPENAI_API_KEY   = _env("OPENAI_API_KEY")
OLLAMA_BASE_URL  = _env("OLLAMA_BASE_URL", "http://localhost:11434")

# Поведение
LONGTERM_ONLY    = bool(int(_env("LONGTERM_ONLY", "0")))
DEDUP            = bool(int(_env("DEDUP", "0")))
DRY_RUN          = bool(int(_env("DRY_RUN", "0")))
PROMPT_LANG      = (_env("PROMPT_LANG", "ru") or "ru").lower()
PROMPT_MODE      = _env("PROMPT_MODE", "full")
SPEAKER_HINTS    = _env("SPEAKER_HINTS", "").strip()
RELAX_FILTERS    = bool(int(_env("RELAX_FILTERS", "0")))
FORCE_PARTICIPANTS = [s.strip() for s in (_env("FORCE_PARTICIPANTS", "") or "").split(",") if s.strip()]

# Чанки
LIMIT_ROWS       = int(_env("LIMIT_ROWS", "0"))
CHUNK_SIZE       = int(_env("CHUNK_SIZE", "0"))      # 0 -> динамические чанки
STRIDE           = int(_env("STRIDE", "0"))          # 0 -> равен CHUNK_SIZE

# Динамическая «масса» чанка (если CHUNK_SIZE=0)
MIN_CHARS        = int(_env("MIN_CHARS", "800"))
MIN_MSGS         = int(_env("MIN_MSGS", "10"))
MAX_CHARS        = int(_env("MAX_CHARS", "2200"))
MAX_GAP_MIN      = int(_env("MAX_GAP_MIN", "45"))

# Пути
DEFAULT_CSV      = _env("MESSAGES_CSV", "messages.csv")
OUTPUT_JSON_PATH = _env("OUTPUT_JSON_PATH", "")      # если пусто — используем out/chunks.jsonl
READABLE_REPORT  = _env("READABLE_REPORT", "")       # если пусто — используем out/facts_readable.md

# --- LLM unified call -------------------------------------------------------

def call_llm(messages, *, temperature=0.1, max_tokens=1500, force_json=True):
    """
    Унифицированный вызов LLM (OpenAI | Ollama). Возвращает текст ответа.
    """
    provider = (LLM_PROVIDER or "openai").lower()

    if DRY_RUN:
        # В сухом режиме — не вызываем LLM вовсе
        return ""

    if provider == "openai":
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY не задан (или .env не подгружен).")
        try:
            from openai import OpenAI
            client = OpenAI(api_key=OPENAI_API_KEY)
            kwargs = dict(model=LLM_MODEL_NAME, messages=messages,
                          temperature=temperature, max_tokens=max_tokens)
            if force_json:
                kwargs["response_format"] = {"type": "json_object"}
            resp = client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content
        except Exception:
            # fallback без response_format
            from openai import OpenAI
            client = OpenAI(api_key=OPENAI_API_KEY)
            resp = client.chat.completions.create(
                model=LLM_MODEL_NAME, messages=messages,
                temperature=temperature, max_tokens=max_tokens
            )
            return resp.choices[0].message.content

    elif provider == "ollama":
        import requests
        url = f"{(OLLAMA_BASE_URL or '').rstrip('/')}/api/chat"
        payload = {
            "model": LLM_MODEL_NAME,
            "messages": messages,
            "stream": False,
            # попробуем JSON-режим; многие модели qwen/* понимают
            "format": "json" if force_json else None,
            "options": {"temperature": temperature}
        }
        r = requests.post(url, json=payload, timeout=600)
        r.raise_for_status()
        data = r.json() or {}
        return ((data.get("message") or {}).get("content") or "")

    else:
        raise RuntimeError(f"Неизвестный LLM_PROVIDER: {LLM_PROVIDER}")

# --- Prompts (RU/EN) --------------------------------------------------------

def build_prompts():
    if PROMPT_LANG == "en":
        base = (
            "You are a dialogue analyst. Extract facts and their evidence from the chat.\n"
            "Mark durability: 'short' for situational, 'long' for stable/repeated facts.\n"
            "Return ONE JSON with keys: participants, summary, tags, facts, entities, alias_map.\n"
            "participants=[{id,name,stance?}] — use names from 'author'.\n"
            "facts=[{subject,predicate,object,durability:'short'|'long',when?,evidence_ids:[int]}].\n"
            "Return AT LEAST 8 facts if possible; otherwise as many as you reliably found.\n"
            "No extra fields; return strictly JSON.\n"
        )
        recall = base + "If unsure, include as 'short' with minimal paraphrase. Do not keep facts empty if any evidence exists.\n"
        user_tpl = "Below are chat messages (id, timestamp, author, text):\n{payload}\nStrictly return JSON only."
    else:
        base = (
            "Отвечай только на русском языке. Ты аналитик диалогов. Извлекай факты и ссылки на сообщения, фокусируясь на информации, которая раскрывает личность, привычки, интересы и взаимоотношения участников, особенно Казаха и Шимона.\n" \
            "durability: 'short' — ситуативное, 'long' — устойчивое/повторяющееся.\n" \
            "Верни ОДИН JSON с полями: participants, summary, tags, facts, entities, alias_map.\n" \
            "В поле 'summary' предоставь три раздела: 'Шимон', 'Казах' и 'Общее'.\n" \
            "1) Для Шимона: укажи, что он делает, думает, считает, предпочитает. Формулируй в стиле: «Шимон — [утверждение]».\n" \
            "2) Для Казаха: укажи, что он делает, думает, считает, предпочитает. Формулируй в стиле: «Казах — [утверждение]».\n" \
            "3) Для Общего: опиши, что у них совместное: какие места, людей, мнения, события они обсуждали между собой.\n" \
            "participants=[{id,name,stance?}] — используй имена из поля author.\n" \
            "facts=[{subject,predicate,object,durability:'short'|'long',when?,evidence_ids:[int]}].\n"
            "Старайся дать НЕ МЕНЕЕ 8 фактов, если позволяет текст; иначе — сколько надёжно.\n"
            "Строго JSON, без лишнего текста."
        )
        recall = base + "Если сомневаешься — лучше включи как 'short' с минимальным перефразом. Не оставляй facts пустым, если есть хоть что-то."
        user_tpl = "Ниже сообщения (id, timestamp, author, text):\n{payload}\nВерни строго JSON."
    if SPEAKER_HINTS:
        base += f"\nПодсказки по ролям/говорящим: {SPEAKER_HINTS}\n"
        recall += f"\nПодсказки по ролям/говорящим: {SPEAKER_HINTS}\n"
    return base, recall, user_tpl

# --- Cleaning ---------------------------------------------------------------

_noise_line = re.compile(r"^(<media>|[ .,:;!?…\-–—_()*\"'«»]+)$", re.IGNORECASE)

def ok_text(s: str) -> bool:
    s = (s or "").strip()
    if not s:
        return False
    sl = s.lower()
    if "messages and calls are end-to-end encrypted" in sl:
        return False
    if not RELAX_FILTERS:
        if "<media>" in sl: return False
        if len(s) <= 2:     return False
        if _noise_line.match(s): return False
        if not re.search(r"[A-Za-zА-Яа-яЁё\u0590-\u05FF]{3,}", s):
            return False
    else:
        # Больше терпимости: пропускаем короткие реплики, но фильтруем явный шум
        if _noise_line.match(s): return False
    return True

def guess_and_load_csv(path, limit_rows=0):
    if not os.path.isfile(path):
        raise FileNotFoundError(f"CSV не найден: {path}")
    df = pd.read_csv(path, nrows=(None if limit_rows <= 0 else limit_rows))
    cols = [c.lower().strip() for c in df.columns]

    # возможные имена
    mapc = {}
    candidates = {
        "id": ["id", "msg_id", "message_id", "index"],
        "timestamp": ["timestamp", "time", "date", "datetime"],
        "author": ["author", "sender", "name", "from"],
        "text": ["text", "message", "body"],
        "is_system": ["is_system", "system", "isSystem"],
        "session_id": ["session_id", "session", "thread_id", "sess_id"],
        "chat_title": ["chat_title", "title", "chat", "thread"],
    }
    for k, opts in candidates.items():
        got = None
        for o in opts:
            if o in cols:
                got = df.columns[cols.index(o)]
                break
        mapc[k] = got

    # если не нашли базовые — попробуем фиксированную схему (WhatsApp-like)
    need = ["id", "timestamp", "author", "text"]
    if any(mapc.get(k) is None for k in need):
        names = ["id", "chat_title", "timestamp", "author", "text", "is_system", "session_id"]
        df = pd.read_csv(path, names=names, header=None, nrows=(None if limit_rows <= 0 else limit_rows))
        mapc = {k: k for k in names if k in df.columns}

    # типы
    try:
        df["id"] = pd.to_numeric(df["id"], errors="coerce").astype("Int64")
    except Exception:
        df["id"] = df["id"].astype(str)

    # Важно: глушим варнинги, поддерживаем смешанные форматы
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=False, format="mixed")
    df["author"] = df["author"].astype(str)
    df["text"]   = df["text"].astype(str)
    if "is_system" in df.columns:
        df["is_system"] = pd.to_numeric(df["is_system"], errors="coerce").fillna(0).astype(int)
    else:
        df["is_system"] = 0
    if "session_id" not in df.columns:
        df["session_id"] = "auto"

    df = df[df["is_system"] == 0].copy()
    df = df[df["text"].map(ok_text)]
    df = df.sort_values("timestamp").reset_index(drop=True)

    # карта id -> текст
    id_to_text = {}
    for _, r in df.iterrows():
        try:
            id_to_text[int(r["id"])] = r["text"]
        except Exception:
            pass
    return df, id_to_text

# --- Chunking ---------------------------------------------------------------

def iter_sliding_chunks(df: pd.DataFrame, size: int, stride: int):
    rows = df.to_dict(orient="records")
    n = len(rows)
    if stride <= 0: stride = size
    i = 0
    while i < n:
        chunk_rows = rows[i:i+size]
        if not chunk_rows:
            break
        yield {"chunk_rows": chunk_rows, "first_id": chunk_rows[0]["id"], "last_id": chunk_rows[-1]["id"]}
        i += stride

def iter_dynamic_chunks(df: pd.DataFrame,
                        min_chars=800, min_msgs=10, max_chars=2200, max_gap_min=45):
    rows = df.to_dict(orient="records")
    rows.sort(key=lambda r: r["timestamp"])
    from datetime import datetime
    buf, chars, authors = [], 0, set()
    prev_t = None
    from datetime import timedelta
    max_gap = timedelta(minutes=max_gap_min)

    def flush():
        nonlocal buf, chars, authors
        if buf:
            out = {"chunk_rows": buf[:], "first_id": buf[0]["id"], "last_id": buf[-1]["id"]}
            buf, chars, authors = [], 0, set()
            return out
        return None

    for r in rows:
        t = r["timestamp"]
        if prev_t and pd.notna(prev_t) and pd.notna(t) and (t - prev_t) > max_gap:
            pkt = flush()
            if pkt: yield pkt
        prev_t = t

        txt = r.get("text") or ""
        buf.append(r)
        chars += len(txt)
        authors.add(r.get("author") or "?")

        if chars >= max_chars or (chars >= min_chars and len(buf) >= min_msgs and len(authors) >= 2):
            pkt = flush()
            if pkt: yield pkt

    tail = flush()
    if tail: yield tail

# --- Fallback regex ---------------------------------------------------------

def fallback_extract_facts(chunk_rows):
    facts = []
    pat_state = re.compile(r"^(?:я|ya|ani|אני)\s+([^\.\?!]{1,80})$", re.IGNORECASE)
    pat_q     = re.compile(r"^(?:ты|ti|ata|אתה|את)?\s*([^\?\n]{1,100})\?$", re.IGNORECASE)
    pat_key   = re.compile(r"(еду|иду|несу|пошли|курить|работ|торт|тц|вижу|сплю|завтра|сегодня)", re.IGNORECASE)

    for r in chunk_rows:
        sid = int(r["id"]) if pd.notna(r["id"]) else None
        spk = r.get("author") or "?"
        txt = (r.get("text") or "").strip()
        if not txt: continue

        if pat_state.match(txt):
            facts.append({"subject": spk, "predicate": "states", "object": txt, "durability": "short",
                          "evidence_ids": [sid] if sid else []})
            continue
        if pat_q.match(txt):
            facts.append({"subject": spk, "predicate": "asks", "object": txt, "durability": "short",
                          "evidence_ids": [sid] if sid else []})
            continue
        if pat_key.search(txt):
            facts.append({"subject": spk, "predicate": "mentions", "object": txt[:140], "durability": "short",
                          "evidence_ids": [sid] if sid else []})

    # лёгкая уникализация
    seen, out = set(), []
    for f in facts:
        k = (f["subject"], f["predicate"], f["object"])
        if k not in seen:
            seen.add(k); out.append(f)
    return out[:16]

# --- Helpers ----------------------------------------------------------------

def top_two_participants(chunk_rows):
    if FORCE_PARTICIPANTS:
        out = []
        for i, name in enumerate(FORCE_PARTICIPANTS, 1):
            out.append({"id": str(i), "name": name, "stance": []})
        return out
    cnt = Counter((r.get("author") or "?") for r in chunk_rows)
    names = [p for p, _ in cnt.most_common(2)]
    return [{"id": str(i+1), "name": n, "stance": []} for i, n in enumerate(names)]

def build_semantic_summary(persona):
    sx = []
    if persona.get("summary"): sx.append(str(persona["summary"]).strip())
    for f in persona.get("facts") or []:
        ev = f.get("evidence_ids") or []
        sx.append(f"{f.get('subject')} — {f.get('predicate')} — {f.get('object')} [{f.get('durability')}] ids:{','.join(map(str,ev))}")
    return "\n".join(sx)

def normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()

def parse_json_safely(s: str):
    s = (s or "").strip()
    if not s: return None
    try:
        return json.loads(s)
    except Exception:
        pass
    m = re.search(r"\{.*\}", s, flags=re.DOTALL)
    if m:
        try: return json.loads(m.group(0))
        except Exception: return None
    return None

# --- Processing --------------------------------------------------------------

def process_chunk(idx, pkt, out_jsonl_path):
    base_sys, recall_sys, user_tpl = build_prompts()
    rows = pkt["chunk_rows"]
    participants = top_two_participants(rows)

    def render_rows(rs):
        lines = []
        for r in rs:
            rid = r.get("id")
            ts  = r.get("timestamp")
            au  = r.get("author") or "?"
            tx  = (r.get("text") or "").replace("\n", " ").strip()
            lines.append(f"{rid}\t{ts}\t{au}\t{tx}")
        return "\n".join(lines)

    payload = render_rows(rows)
    user_prompt = user_tpl.format(payload=payload)

    persona = {}

    if not DRY_RUN:
        # шаг 1
        resp = call_llm([{"role":"system","content":base_sys},
                         {"role":"user","content":user_prompt}], temperature=0.1)
        persona = parse_json_safely(resp) or {}
        facts = persona.get("facts") or []
        # шаг 2 high-recall
        if len(facts) < 3:
            resp2 = call_llm([{"role":"system","content":recall_sys},
                              {"role":"user","content":user_prompt}], temperature=0.2)
            persona2 = parse_json_safely(resp2) or {}
            if len((persona2.get("facts") or [])) > len(facts):
                persona = persona2
    else:
        persona = {}

    # --- NEW: Filter unexpected keys from LLM response ---
    EXPECTED_PERSONA_KEYS = ["participants", "summary", "tags", "facts", "entities", "alias_map"]
    filtered_persona = {k: v for k, v in persona.items() if k in EXPECTED_PERSONA_KEYS}
    persona = filtered_persona
    # --- END NEW ---

    # Фолбэк
    persona.setdefault("facts", [])
    if len(persona["facts"]) < 2:
        persona["facts"].extend(fallback_extract_facts(rows))

    # Гарантии полей
    persona.setdefault("participants", participants)
    persona.setdefault("summary", "")
    persona.setdefault("tags", [])
    persona.setdefault("entities", [])
    if "alias_map" not in persona:
        am = {}
        for p in persona["participants"]:
            nm = p.get("name")
            if nm: am[nm] = nm
        persona["alias_map"] = am

    # Семантический ключ и запись
    semantic = build_semantic_summary(persona)
    dedup_key = hashlib.sha1((normalize_ws(semantic) + f"|{pkt['first_id']}-{pkt['last_id']}").encode("utf-8")).hexdigest()

    rec = {
        "point_id": str(uuid.uuid4()),
        "session_id": "mixed",
        "chunk_index": idx,
        "chunk_first_id": pkt["first_id"],
        "chunk_last_id": pkt["last_id"],
        "semantic_summary": semantic,
        "persona": persona,
        "dedup_key": dedup_key,
        "alias_map": persona.get("alias_map", {}),
    }

    # JSONL append
    with open(out_jsonl_path, "a", encoding="utf-8") as fw:
        fw.write(json.dumps(rec, ensure_ascii=False) + "\n")

    return rec

def post_aggregate_longterm(records):
    c = Counter()
    for r in records:
        for f in (r.get("persona", {}).get("facts") or []):
            c[(f.get("subject"), f.get("predicate"), f.get("object"))] += 1
    for r in records:
        for f in (r.get("persona", {}).get("facts") or []):
            if c[(f.get("subject"), f.get("predicate"), f.get("object"))] >= 2:
                f["durability"] = "long"

def write_artifacts(records, id_to_text, out_jsonl_path, readable_path):
    # дедуп по записи
    if DEDUP:
        seen, new = set(), []
        for r in records:
            k = r["dedup_key"]
            if k in seen: continue
            seen.add(k); new.append(r)
        records = new

    # только long?
    if LONGTERM_ONLY:
        for r in records:
            p = r.get("persona") or {}
            p["facts"] = [f for f in (p.get("facts") or []) if f.get("durability") == "long"]

    # читаемый отчёт
    lines = []
    lines.append("# Facts (readable)\n")
    for r in records:
        p = r.get("persona") or {}
        lines.append(f"## Chunk {r.get('chunk_index')} [{r.get('chunk_first_id')}–{r.get('chunk_last_id')}]")
        if p.get("summary"):
            lines.append(f"**Summary:** {p['summary']}")
        for f in p.get("facts") or []:
            ev = f.get("evidence_ids") or []
            lines.append(f"- {f.get('subject')} — **{f.get('predicate')}** — {f.get('object')} "
                         f"(`{f.get('durability')}`; ids: {','.join(map(str,ev))})")
        lines.append("")
    with open(readable_path, "w", encoding="utf-8") as fw:
        fw.write("\n".join(lines))

# --- CLI --------------------------------------------------------------------

def main():
    # <<< ДОЛЖНО БЫТЬ ПЕРВЫМ ВНУТРИ main() >>>
    global LLM_PROVIDER, LLM_MODEL_NAME, OPENAI_API_KEY

    ap = argparse.ArgumentParser(
        prog="extract_chat_facts_v2_1.py",
        description="Извлечение фактов из чатов (.env-friendly)."
    )
    ap.add_argument("--csv", default=DEFAULT_CSV, help="Путь к messages.csv (или MESSAGES_CSV в .env)")
    ap.add_argument("--out", default="out", help="Каталог для артефактов")

    # теперь можно безопасно читать глобальные значения в default
    ap.add_argument("--provider",   default=os.getenv("LLM_PROVIDER",   LLM_PROVIDER))
    ap.add_argument("--model",      default=os.getenv("LLM_MODEL_NAME", LLM_MODEL_NAME))
    ap.add_argument("--openai_key", default=os.getenv("OPENAI_API_KEY", OPENAI_API_KEY))

    args = ap.parse_args()

    # применяем CLI поверх globals
    LLM_PROVIDER   = args.provider or LLM_PROVIDER
    LLM_MODEL_NAME = args.model    or LLM_MODEL_NAME
    if args.openai_key:
        OPENAI_API_KEY = args.openai_key

    os.makedirs(args.out, exist_ok=True)
    out_jsonl_path = Path(OUTPUT_JSON_PATH if OUTPUT_JSON_PATH else os.path.join(args.out, "chunks.jsonl")).expanduser().resolve()
    readable_path  = Path(READABLE_REPORT  if READABLE_REPORT  else os.path.join(args.out, "facts_readable.md")).expanduser().resolve()

    out_jsonl_path.write_text("", encoding="utf-8")  

    open(out_jsonl_path, "w", encoding="utf-8").close()

    df, id_to_text = guess_and_load_csv(args.csv, limit_rows=LIMIT_ROWS)

    if CHUNK_SIZE and CHUNK_SIZE > 0:
        stride = STRIDE if STRIDE and STRIDE > 0 else CHUNK_SIZE
        chunks_iter = iter_sliding_chunks(df, CHUNK_SIZE, stride)
        total_chunks = ceil(len(df) / stride)
    else:
        chunks_iter = iter_dynamic_chunks(df, MIN_CHARS, MIN_MSGS, MAX_CHARS, MAX_GAP_MIN)
        total_chunks = None # tqdm will show elapsed time and processed items

    records = []
    for idx, pkt in tqdm(enumerate(chunks_iter), total=total_chunks, desc="Processing chunks"):
        rec = process_chunk(idx, pkt, out_jsonl_path)
        records.append(rec)

    post_aggregate_longterm(records)
    write_artifacts(records, id_to_text, out_jsonl_path, readable_path)
    jsonl_size = out_jsonl_path.stat().st_size if out_jsonl_path.exists() else 0
    md_size    = readable_path.stat().st_size if readable_path.exists() else 0

    print("Готово.")
    print(f"CSV: {args.csv}")
    print(f"Chunks JSONL: {out_jsonl_path} (size: {jsonl_size} bytes)")
    print(f"Readable report: {readable_path} (size: {md_size} bytes)")
    print(f"Чанков: {len(records)}  | DRY_RUN: {DRY_RUN}  | Provider: {LLM_PROVIDER}/{LLM_MODEL_NAME}")


if __name__ == "__main__":
    main()
