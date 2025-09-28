#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_chat_facts.py  — v3 (DRY_RUN / JSON preview mode)

Добавлено:
- DRY_RUN=1 — не пишет в Qdrant, сохраняет результаты в JSONL (OUTPUT_JSON_PATH, по умолчанию facts_sample.jsonl)
- Короткий системный промпт (PROMPT_MODE=short|full; default short)
- LIMIT_ROWS — ограничение строк CSV для дешёвого теста
- Перекрытие чанков: CHUNK_SIZE / STRIDE

.env параметры:
  OPENAI_API_KEY=...
  QDRANT_URL=http://localhost:6333
  CONVERSATION_FACTS_COLLECTION=conversation_facts
  EMBEDDING_MODEL_NAME=text-embedding-3-small
  LLM_MODEL_NAME=gpt-4o-mini
  MESSAGES_CSV=koyzah/messages.csv
  CHUNK_SIZE=10
  STRIDE=10
  BATCH_SIZE=500
  CONCURRENCY=4

  # Новые:
  DRY_RUN=1
  OUTPUT_JSON_PATH=facts_sample.jsonl
  PROMPT_MODE=short  # short|full
  LIMIT_ROWS=200
"""

import os
import re
import uuid
import json
import asyncio
import warnings
from typing import Any, Dict, List, Tuple

import pandas as pd
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential
from tqdm import tqdm
from qdrant_client import QdrantClient, models as qmodels

try:
    from openai import OpenAI
except Exception as e:
    raise RuntimeError("OpenAI SDK not found. Install with: pip install openai>=1.0.0") from e

warnings.filterwarnings("ignore", category=DeprecationWarning)


def clean_fact_text(text: str, max_len: int = 300) -> str:
    t = re.sub(r"\s+", " ", (text or "")).strip()
    return t[:max_len]


def normalize_author(name: str) -> str:
    return (name or "").strip()


NAMESPACE_UUID = uuid.uuid5(uuid.NAMESPACE_URL, "koyzah/conversation_facts")


class OpenAIClient:
    def __init__(self, api_key: str, emb_model: str, llm_model: str, prompt_mode: str = "short"):
        self.client = OpenAI(api_key=api_key)
        self.emb_model = emb_model
        self.llm_model = llm_model
        self.prompt_mode = prompt_mode
        self._emb_cache: Dict[str, List[float]] = {}

    @retry(reraise=True, stop=stop_after_attempt(5), wait=wait_exponential(min=1, max=20))
    def embed(self, text: str) -> List[float]:
        if text in self._emb_cache:
            return self._emb_cache[text]
        resp = self.client.embeddings.create(model=self.emb_model, input=text)
        vec = resp.data[0].embedding
        self._emb_cache[text] = vec
        return vec

    def _system_prompt(self) -> str:
        if self.prompt_mode == "full":
            return (
                "You are an expert in extracting facts and opinions from conversations.\n"
                "Your task is to read a conversation chunk and extract concise facts or strong opinions expressed by each speaker.\n"
                "Attribute each extracted fact/opinion to the speaker who expressed it.\n"
                "Focus on factual statements, beliefs, preferences, or strong assertions.\n"
                "Ignore greetings, small talk, questions, commands, or conversational filler.\n"
                "Respond with a JSON array of objects, each having 'speaker_id' and 'fact_text'."
            )
        # short
        return (
            "Extract concise facts or strong opinions from the conversation.\n"
            "Return JSON array of {\"speaker_id\",\"fact_text\"}. Ignore greetings, filler, questions."
        )

    @retry(reraise=True, stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=20))
    async def extract_facts_from_chunk(self, messages_chunk: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        sys_prompt = self._system_prompt()
        user_lines = ["Conversation chunk:"]
        for m in messages_chunk:
            author = (m.get("author") or "").strip()
            text = (m.get("text") or "").replace("\n", " ").strip()
            if not text:
                continue
            user_lines.append(f"- [{author}]: {text}")
        user_prompt = "\n".join(user_lines) if len(user_lines) > 1 else "Conversation chunk: (empty)"

        def _call_openai():
            return self.client.chat.completions.create(
                model=self.llm_model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
            )

        resp = await asyncio.to_thread(_call_openai)
        content = resp.choices[0].message.content or "[]"

        try:
            data = json.loads(content)
            items = data if isinstance(data, list) else data.get("items", [])
        except Exception:
            items = []

        results: List[Dict[str, str]] = []
        for obj in items:
            speaker = normalize_author(obj.get("speaker_id", ""))
            fact = clean_fact_text(obj.get("fact_text", ""))
            if speaker and fact:
                results.append({"speaker_id": speaker, "fact_text": fact})
        # уникализация
        seen = set()
        uniq = []
        for r in results:
            key = (r["speaker_id"], r["fact_text"])
            if key in seen:
                continue
            seen.add(key)
            uniq.append(r)
        return uniq


def recreate_collection(q: QdrantClient, collection: str, vector_size: int):
    q.recreate_collection(
        collection_name=collection,
        vectors_config=qmodels.VectorParams(size=vector_size, distance=qmodels.Distance.COSINE),
        optimizers_config=qmodels.OptimizersConfigDiff(indexing_threshold=0),
    )


def iter_chunks_by_session_stride(df: pd.DataFrame, chunk_size: int, stride: int):
    for sess_id, g in df.groupby("session_id", sort=False):
        g = g.sort_values("ts")
        rows = g.to_dict("records")
        n = len(rows)
        i = 0
        yielded = 0
        while i < n:
            j = min(i + chunk_size, n)
            if j - i < 3 and yielded == 0:
                break
            if j - i < 3 and yielded > 0:
                break
            yield sess_id, rows[i:j]
            yielded += 1
            if j >= n:
                break
            i += stride


def build_point_id(message_id: str, fact_idx: int) -> str:
    return str(uuid.uuid5(NAMESPACE_UUID, f"{message_id}-{fact_idx}"))


async def main():
    load_dotenv()

    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
    COLLECTION = os.getenv("CONVERSATION_FACTS_COLLECTION", "conversation_facts")
    EMB_MODEL = os.getenv("EMBEDDING_MODEL_NAME", "text-embedding-3-small")
    LLM_MODEL = os.getenv("LLM_MODEL_NAME", "gpt-4o-mini")
    CSV_PATH = os.getenv("MESSAGES_CSV", "koyzah/messages.csv")

    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "10"))
    STRIDE = int(os.getenv("STRIDE", str(CHUNK_SIZE)))
    BATCH_SIZE = int(os.getenv("BATCH_SIZE", "500"))
    CONCURRENCY = int(os.getenv("CONCURRENCY", "4"))
    DRY_RUN = os.getenv("DRY_RUN", "1") == "1"
    OUTPUT_JSON_PATH = os.getenv("OUTPUT_JSON_PATH", "facts_sample.jsonl")
    PROMPT_MODE = os.getenv("PROMPT_MODE", "short")
    LIMIT_ROWS = os.getenv("LIMIT_ROWS")

    if not OPENAI_API_KEY:
        print("[ERROR] OPENAI_API_KEY is missing in .env", flush=True)
        raise SystemExit(1)

    openai_client = OpenAIClient(api_key=OPENAI_API_KEY, emb_model=EMB_MODEL, llm_model=LLM_MODEL, prompt_mode=PROMPT_MODE)

    if not os.path.exists(CSV_PATH):
        print(f"[ERROR] CSV file not found: {CSV_PATH}", flush=True)
        raise SystemExit(1)

    print(f"[INFO] Reading CSV: {CSV_PATH}", flush=True)
    df = pd.read_csv(CSV_PATH)
    df = df[(df["is_system"] == 0) & (df["text"].notna())]
    df = df.sort_values(["session_id", "ts"])

    if LIMIT_ROWS:
        try:
            n = int(LIMIT_ROWS)
            df = df.head(n)
            print(f"[INFO] LIMIT_ROWS active: using first {n} rows", flush=True)
        except Exception:
            pass

    chunks = list(iter_chunks_by_session_stride(df, chunk_size=CHUNK_SIZE, stride=STRIDE))
    print(f"[INFO] Total chunks: {len(chunks)} (chunk_size={CHUNK_SIZE}, stride={STRIDE})", flush=True)

    sem = asyncio.Semaphore(CONCURRENCY)

    # DRY_RUN: open JSONL file
    jsonl_f = open(OUTPUT_JSON_PATH, "w", encoding="utf-8") if DRY_RUN else None

    # If not dry-run, init Qdrant collection
    if not DRY_RUN:
        qdrant = QdrantClient(url=QDRANT_URL)
        # probe embedding dimension
        vec_dim = len(openai_client.embed("dimension probe"))
        recreate_collection(qdrant, COLLECTION, vec_dim)
        pending_points: List[qmodels.PointStruct] = []

    async def process_chunk(idx: int, sess_id: str, rows: List[Dict[str, Any]]):
        async with sem:
            msgs = [{"author": r["author"], "text": r["text"]} for r in rows if isinstance(r.get("text"), str) and r["text"].strip()]
            if not msgs:
                return []

            try:
                facts = await openai_client.extract_facts_from_chunk(msgs)
            except Exception as e:
                print(f"[ERROR] LLM error on session {sess_id}: {e}", flush=True)
                facts = []

            if not facts:
                return []

            last = rows[-1]
            base_msg_id = str(last["id"])
            sess = str(last["session_id"])
            ts = last["ts"]

            outputs = []
            for fidx, f in enumerate(facts):
                record = {
                    "speaker_id": f["speaker_id"],
                    "fact_text": clean_fact_text(f["fact_text"]),
                    "message_id": base_msg_id,
                    "session_id": sess,
                    "ts": ts,
                    "chunk_index": idx,
                }
                outputs.append(record)
            return outputs

    total_written = 0
    for idx, (sess_id, rows) in enumerate(tqdm(chunks, desc="Processing chunks")):
        out_recs = await process_chunk(idx, sess_id, rows)
        if not out_recs:
            continue

        if DRY_RUN:
            for rec in out_recs:
                jsonl_f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            total_written += len(out_recs)
        else:
            # prepare Qdrant points
            pts: List[qmodels.PointStruct] = []
            for rec_idx, rec in enumerate(out_recs):
                pid = str(uuid.uuid5(NAMESPACE_UUID, f"{rec['message_id']}-{rec_idx}"))
                vec = openai_client.embed(rec["fact_text"])
                pts.append(qmodels.PointStruct(id=pid, vector=vec, payload=rec))

            pending_points.extend(pts)
            if len(pending_points) >= BATCH_SIZE:
                try:
                    qdrant.upsert(collection_name=COLLECTION, points=pending_points[:BATCH_SIZE])
                except Exception as e:
                    print(f"[ERROR] Qdrant upsert error: {e}", flush=True)
                pending_points = pending_points[BATCH_SIZE:]

    if DRY_RUN and jsonl_f:
        jsonl_f.close()
        print(f"[INFO] DRY_RUN complete. JSONL saved to: {OUTPUT_JSON_PATH} (records={total_written})", flush=True)
    elif not DRY_RUN:
        if pending_points:
            try:
                qdrant.upsert(collection_name=COLLECTION, points=pending_points)
            except Exception as e:
                print(f"[ERROR] Qdrant final upsert error: {e}", flush=True)
        print("[INFO] Upsert complete.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
