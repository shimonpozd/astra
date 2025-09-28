#!/usr/bin/env python3
# -*- coding: utf-8 -*-"""

import os
import re
import uuid
import json
import asyncio
import math
from typing import Any, Dict, List, Optional
import hashlib
from datetime import datetime

import pandas as pd
import requests
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential
from tqdm import tqdm

# ----------------- Утилиты -----------------
def clean_ws(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()

def generate_slug(name: str) -> str:
    """Generates a slug from a string."""
    return name.lower().replace(' ', '-').strip()

NAMESPACE_UUID = uuid.uuid5(uuid.NAMESPACE_URL, "koyzah/conversation_facts")

def read_progress(progress_file_path: str) -> int:
    if os.path.exists(progress_file_path):
        try:
            with open(progress_file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("last_processed_chunk_index", data.get("last_upserted_chunk_index", 0))
        except (json.JSONDecodeError, AttributeError):
            return 0
    return 0

def write_progress(progress_file_path: str, chunk_index: int):
    with open(progress_file_path, "w", encoding="utf-8") as f:
        json.dump({"last_processed_chunk_index": chunk_index}, f)

# ----------------- LLM Extractor -----------------
class LLMExtractor:
    def __init__(self, provider: str, model: str, openai_api_key: Optional[str] = None, ollama_base_url: str = "http://localhost:11434", groq_api_key: Optional[str] = None, openrouter_api_key: Optional[str] = None):
        self.provider = provider
        self.model = model
        self._client: Optional[Any] = None
        self._ollama_url = ollama_base_url.rstrip("/")

        if provider == "openai" or provider == "groq" or provider == "openrouter":
            from openai import AsyncOpenAI
            api_key = None
            base_url = None
            if provider == "openai":
                api_key = openai_api_key
                if not api_key:
                    raise RuntimeError("OPENAI_API_KEY must be set for provider=openai")
            elif provider == "groq":
                api_key = groq_api_key
                base_url = "https://api.groq.com/openai/v1"
                if not api_key:
                    raise RuntimeError("GROQ_API_KEY must be set for provider=groq")
            elif provider == "openrouter":
                api_key = openrouter_api_key
                base_url = "https://openrouter.ai/api/v1"
                if not api_key:
                    raise RuntimeError("OPENROUTER_API_KEY must be set for provider=openrouter")
            
            self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    def _get_system_prompt(self) -> str:
        return (
            "Ты — профессиональный аналитик прослушки. Диалог двух людей: Шимон и Казах. "
            "Твоя задача — собрать устойчивые сведения о них и их окружении."

            "Факт сохраняй только если он:"
            "- описывает устойчивую характеристику (роль, профессию, связь, привычку, мнение, вкус, установку);"
            "- выражен как долговременный (например, «Шимон работает дизайнером», «Казах любит острое»);"
            "- содержит достаточную информативность (не слишком общий)."

            "Игнорируй:"
            "- слишком общие утверждения («Шимон работает»);"
            "- разовые действия или состояния («Шимон проснулся поздно», «вышли покурить»);"
            "- совместные действия, если они не описаны как устойчивая привычка («часто курят вместе» допустимо, но не «курят вместе» один раз);"
            "- любые факты без уточнений, которые не добавляют нового знания."
            "Каждый факт — одно короткое, самодостаточное утверждение. Если нет фактов по этим критериям — верни пустой массив."
            "СТРОГОЕ ПРАВИЛО: Ответ должен быть только на русском языке. Все значения в JSON (text, topics, entities) должны быть на русском языке."
            "Отвечай только валидным JSON одной строкой без комментариев и пояснений."
            "Верни ТОЛЬКО JSON-массив объектов, где каждый объект — один факт."
        )

    def _get_user_prompt(self, messages: List[Dict[str, Any]]) -> str:
        schema = {
            "facts": [
                {
                    "fact_type": "string (тип факта: profile|event|preference|habit|relation|etc.)",
                    "text": "string (короткий, 1-2 предложения, самодостаточный факт)",
                    "text_for_vector": "string (краткий/нормализованный текст для эмбеддинга)",
                    "entities": [{"name": "string", "type": "string (person|org|place|other)"}],
                    "triples": [{"s": "string", "p": "string", "o": "string"}],
                    "topics": ["string (список тегов/тем)"],
                    "support_msg_indices": ["int (индексы сообщений из чанка, подтверждающих факт)"],
                    "llm_certainty": "float (0.0-1.0, твоя уверенность в точности факта)",
                    "verbatim": "int (1 если факт - почти дословная цитата из одного сообщения, иначе 0)"
                }
            ]
        }
        messages_with_indices = [{"index": i, **msg} for i, msg in enumerate(messages)]
        return json.dumps({"messages": messages_with_indices, "schema": schema}, ensure_ascii=False, indent=2)

    def _parse_llm_json(self, s: str) -> List[Dict[str, Any]]:
        if not s: return []
        try:
            data = json.loads(s)
            # Case 1: The response is the JSON object {"facts": [...]}
            if isinstance(data, dict) and "facts" in data and isinstance(data["facts"], list):
                return data["facts"]
            # Case 2: The response is a raw JSON array [...]
            if isinstance(data, list):
                return data
        except Exception: pass
        # Fallback regex for cases where JSON is embedded in text
        m = re.search(r'{\s*"facts"\s*:\s*(\[.*?\])\s*}', s, flags=re.DOTALL)
        if m: 
            try: return json.loads(m.group(1))
            except Exception: return []
        return []

    async def extract_facts(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        sys_prompt = self._get_system_prompt()
        
        # Convert Timestamps before serialization
        serializable_messages = []
        for m in messages:
            new_m = m.copy()
            if 'ts' in new_m and hasattr(new_m['ts'], 'isoformat'):
                new_m['ts'] = new_m['ts'].isoformat()
            serializable_messages.append(new_m)

        user_prompt = self._get_user_prompt(serializable_messages)

        if self.provider in ["openai", "groq", "openrouter"]:
            resp = await self._client.chat.completions.create(
                model=self.model, response_format={"type": "json_object"},
                messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
                temperature=0.1,
            )
            txt = resp.choices[0].message.content or ""
        else: # ollama
            payload = {"model": self.model, "messages": [{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}], "format": "json", "stream": False}
            r = requests.post(f"{self._ollama_url}/api/chat", json=payload, timeout=120)
            r.raise_for_status()
            txt = (r.json().get("message") or {}).get("content", "")
        
        print(f"LLM raw response: {txt}")
        return self._parse_llm_json(txt)

# ----------------- Чтение и подготовка данных -----------------
def load_messages_csv(path: str, limit_rows: int) -> pd.DataFrame:
    if not os.path.isfile(path): raise FileNotFoundError(path)
    df = pd.read_csv(path)
    rename_map = {"message_id": "id", "chat_id": "session_id", "timestamp": "ts", "sender_name": "author"}
    df.rename(columns=rename_map, inplace=True)
    required_cols = ['author', 'text', 'sender_role', 'id', 'ts']
    if not all(col in df.columns for col in required_cols):
        missing = [col for col in required_cols if col not in df.columns]
        raise ValueError(f"Required columns missing from CSV: {missing}")
    df['ts'] = pd.to_datetime(df['ts'], errors='coerce')
    df.dropna(subset=['ts', 'author', 'text'], inplace=True)
    df = df.sort_values(by=["ts", "id"], kind="mergesort")
    if limit_rows > 0: df = df.head(limit_rows)
    return df

def iter_chunks(df: pd.DataFrame, chunk_size: int, stride: int):
    rows = df.to_dict(orient="records")
    n = len(rows)
    i = 0
    while i < n:
        j = min(i + chunk_size, n)
        if j - i < 3: break
        yield rows[i:j]
        if j >= n: break
        i += stride

# ----------------- Расчет Confidence и создание записи -----------------
def normalize_text(text: str) -> str:
    return re.sub(r"\s+", ' ', text).strip().lower()

def calculate_confidence(fact: Dict, supporting_msgs: List) -> float:
    """
    Calculates confidence based on the "Fact v2" rule.
    """
    llm_certainty_val = fact.get("llm_certainty")
    llm_certainty = float(llm_certainty_val) if llm_certainty_val is not None else 0.7
    evidence_norm = min(len(supporting_msgs) / 3.0, 1.0)
    verbatim = int(fact.get("verbatim", 0))
    
    type_boost_types = {"profile", "relation", "habit"}
    type_boost = 0.1 if fact.get("fact_type") in type_boost_types else 0.0

    confidence = (
        0.35
        + 0.35 * llm_certainty
        + 0.10 * evidence_norm
        + 0.10 * verbatim
        + 0.10 * type_boost
    )
    
    return round(max(0, min(confidence, 1)), 2)

def detect_lang(text: str) -> str:
    if re.search(r"[\u0590-\u05FF]", text): return "he"
    return "ru"

# ----------------- Main -----------------
# ----------------- Main -----------------
CANONICAL_NAME_MAP = {
    "казах": "Казах",
    "шимон": "Шимон",
    # Add other name variations here
}

def get_canonical_name(name: str) -> str:
    return CANONICAL_NAME_MAP.get(name.lower(), name)

async def main():
    load_dotenv(override=True)
    
    # --- Config ---
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    LLM_MODEL = os.getenv("LLM_MODEL_NAME", "qwen2:7b")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
    MESSAGES_CSV = os.getenv("MESSAGES_CSV", "messages.csv")
    QDRANT_OUTPUT_PATH = os.getenv("QDRANT_OUTPUT_PATH", "facts_for_qdrant.jsonl")
    NEO4J_OUTPUT_PATH = os.getenv("NEO4J_OUTPUT_PATH", "facts_for_neo4j.jsonl")
    PROGRESS_FILE_PATH = os.getenv("PROGRESS_FILE_PATH", "progress.json")
    LIMIT_ROWS = int(os.getenv("LIMIT_ROWS", -1))
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 30))
    STRIDE = int(os.getenv("STRIDE", 10))
    DRY_RUN = os.getenv("DRY_RUN", "0") == "1"

    # --- Init ---
    extractor = LLMExtractor(
        provider=LLM_PROVIDER, 
        model=LLM_MODEL, 
        openai_api_key=OPENAI_API_KEY, 
        ollama_base_url=OLLAMA_BASE_URL,
        groq_api_key=GROQ_API_KEY,
        openrouter_api_key=OPENROUTER_API_KEY
    )
    df = load_messages_csv(MESSAGES_CSV, LIMIT_ROWS)
    start_chunk_index = 0 if DRY_RUN else read_progress(PROGRESS_FILE_PATH)
    
    if not DRY_RUN:
        os.makedirs(os.path.dirname(QDRANT_OUTPUT_PATH) or ".", exist_ok=True)
        os.makedirs(os.path.dirname(NEO4J_OUTPUT_PATH) or ".", exist_ok=True)
    
    print(f"Loaded {len(df)} messages. Starting from chunk {start_chunk_index}.")

    # --- Processing Loop ---
    chunks = list(iter_chunks(df, CHUNK_SIZE, STRIDE))
    for idx, chunk in enumerate(tqdm(chunks, desc="Extracting Facts")):
        if idx < start_chunk_index: continue

        try:
            llm_facts = await extractor.extract_facts(chunk)
        except Exception as e:
            print(f"[ERROR] Failed to process chunk {idx}: {e}")
            continue

        if not llm_facts:
            print(f"Chunk {idx}: No facts found.")
            continue

        facts_written = 0
        seen_fact_ids = set()
        for fact in llm_facts:
            text = fact.get("text")
            if not text or len(text) < 8 or "?" in text or re.search(r'(может|наверное|если)', text, re.IGNORECASE):
                continue

            support_indices_raw = fact.get("support_msg_indices", [])
            support_indices = []
            for i in support_indices_raw:
                try:
                    support_indices.append(int(i))
                except (ValueError, TypeError):
                    pass
            
            supporting_msgs = [chunk[i] for i in support_indices if i < len(chunk)]
            if not supporting_msgs: continue

            confidence = calculate_confidence(fact, supporting_msgs)

            # --- Assemble Final Record ---
            first_msg = supporting_msgs[0]
            session_id = first_msg.get("session_id", "unknown_chat")
            ts_start_dt = first_msg['ts']
            # Per plan: use UTC int timestamp
            ts_start_unix = int(ts_start_dt.timestamp())
            date_int = int(ts_start_dt.strftime('%Y%m%d'))
            
            source_ids = sorted([msg['id'] for msg in supporting_msgs])
            text_for_vector = fact.get("text_for_vector", text)
            
            speaker = get_canonical_name(first_msg['author'])
            participants = sorted(list({get_canonical_name(m['author']) for m in supporting_msgs}))

            # ID generation - per plan, use sha256
            id_basis = f"{normalize_text(text_for_vector)}|{session_id}|{speaker}|{min(source_ids)}|{date_int}"
            fact_id = hashlib.sha256(id_basis.encode('utf-8')).hexdigest()

            if fact_id in seen_fact_ids:
                continue
            seen_fact_ids.add(fact_id)

            lang = detect_lang(text)
            
            topics_raw = fact.get("topics", [])
            topic_slugs = sorted(list({generate_slug(t) for t in topics_raw}))

            entities_full = fact.get("entities", [])
            entity_names = []
            if entities_full:
                # Handle cases where entities are dicts or strings
                if isinstance(entities_full[0], dict):
                    entity_names = sorted(list({e.get('name') for e in entities_full if e.get('name')}))
                elif isinstance(entities_full[0], str):
                    entity_names = sorted(list(set(entities_full)))
            entity_slugs = sorted(list({generate_slug(e) for e in entity_names}))


            # --- Qdrant Record ---
            qdrant_payload = {
                "text": text,
                "fact_type": fact.get("fact_type", "generic"),
                "confidence": confidence,
                "timestamp": ts_start_unix,
                "date_int": date_int,
                "session_id": session_id,
                "speaker": speaker,
                "participants": participants,
                "topic_slugs": topic_slugs,
                "entity_slugs": entity_slugs,
                "source_message_ids": source_ids,
                "lang": lang,
                "meta": { "platform": "WhatsApp", "version": 2 }
            }
            qdrant_record = {"id": fact_id, "payload": qdrant_payload}

            # --- Neo4j Record ---
            neo4j_record = {
                "fact_id": fact_id,
                "text": text,
                "fact_type": fact.get("fact_type", "generic"),
                "confidence": confidence,
                "timestamp": ts_start_unix,
                "speaker": speaker,
                "participants": participants,
                "topic_slugs": topic_slugs,
                "entity_slugs": entity_slugs,
                "source_message_ids": source_ids
            }

            if not DRY_RUN:
                with open(QDRANT_OUTPUT_PATH, "a", encoding="utf-8") as f:
                    f.write(json.dumps(qdrant_record, ensure_ascii=False) + "\n")
                with open(NEO4J_OUTPUT_PATH, "a", encoding="utf-8") as f:
                    f.write(json.dumps(neo4j_record, ensure_ascii=False) + "\n")
                facts_written += 1
        
        if facts_written > 0:
            print(f"Chunk {idx}: Wrote {facts_written} facts.")

        if not DRY_RUN:
            write_progress(PROGRESS_FILE_PATH, idx + 1)

    print("Processing finished.")


if __name__ == "__main__":
    asyncio.run(main())