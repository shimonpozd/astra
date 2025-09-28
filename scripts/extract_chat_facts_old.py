#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_chat_facts.py — единый промпт

Задача: разбивать переписку на чанки (например по 50 сообщений), и для каждого чанка LLM должна возвращать СУТЬ разговора.
"""

import os
import re
import uuid
import json
import asyncio
from typing import Any, Dict, List, Optional
import hashlib

import pandas as pd
import requests
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential
from tqdm import tqdm

try:
    from qdrant_client import QdrantClient, models as qmodels
except Exception:
    QdrantClient, qmodels = None, None

try:
    from openai import OpenAI
except Exception as e:
    raise RuntimeError("OpenAI SDK not found. Install with: pip install openai>=1.0.0") from e

# ----------------- Утилиты -----------------
def clean_ws(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()

NAMESPACE_UUID = uuid.uuid5(uuid.NAMESPACE_URL, "koyzah/conversation_facts")

# ----------------- Embeddings -----------------
class OpenAIEmbedder:
    def __init__(self, api_key: str, emb_model: str):
        self.client = OpenAI(api_key=api_key)
        self.emb_model = emb_model

    @retry(reraise=True, stop=stop_after_attempt(5), wait=wait_exponential(min=1, max=20))
    def embed(self, text: str) -> List[float]:
        text = clean_ws(text)
        resp = self.client.embeddings.create(model=self.emb_model, input=text)
        return resp.data[0].embedding

# ----------------- LLM Extractor -----------------
class LLMExtractor:
    def __init__(self, provider: str, model: str, openai_api_key: Optional[str] = None, ollama_base_url: str = "http://localhost:11434", prompt_lang: str = "ru"):
        self.provider = provider
        self.model = model
        self.prompt_lang = prompt_lang
        self._openai: Optional[OpenAI] = None
        self._ollama_url = ollama_base_url.rstrip("/")
        if provider == "openai":
            if not openai_api_key:
                raise RuntimeError("OPENAI_API_KEY must be set for provider=openai")
            self._openai = OpenAI(api_key=openai_api_key)

    @staticmethod
    def _prompt_system(lang: str) -> str:
        return (
            "Ты аналитик диалога и конструктор долговременной базы знаний о людях. "
            "Игнорируй бытовые детали, одноразовые события, логистику, приветствия, мелкие статусы. "
            "Фокус: устойчивые сведения о личностях, ролях, отношениях, упоминаниях мест, а также прозвищах и их разрешении (alias_map: кто как кого называет). Учитывай, что обсуждаемые события могли происходить в прошлом; если это устаревшая или неактуальная информация (например «Шимон искал работу 5 лет назад»), не относись к ней как к актуальной долговременной характеристике, а пометь как short или отфильтруй. "
            "Верни ОДИН JSON-ОБЪЕКТ с ключами: participants, summary, tags, memories, entities.\\n"
            "Участников РОВНО ДВА (из hints/author).\\n"
            "memories — ТОЛЬКО долговременные сведения: убеждения, предпочтения, роли, повторяемые паттерны, биографические факты. Для каждого укажи durability='long'|'short' и не выводи 'short'.\\n"
            "entities — карта третьих лиц/объектов и мест с прозвищами (aliases) и СВЯЗЯМИ (relations) как триплеты subject–predicate–object; каждой связи задай durability и выводи только 'long'. Также заполни alias_map: словарь {прозвище: каноническое_имя}."
        )

    @staticmethod
    def _prompt_user(messages: List[Dict[str, Any]], lang: str, speaker_hints: Optional[str] = None) -> str:
        force = os.getenv("FORCE_PARTICIPANTS", "").strip()
        if force:
            participants = [p.strip() for p in force.split(",") if p.strip()][:2]
        else:
            from collections import Counter
            cnt = Counter([str(m.get("author","?")).strip() for m in messages if str(m.get("author","?")).strip()])
            participants = [name for name,_ in cnt.most_common(2)]
        payload = {
            "task": "Сожми суть разговора (структурированный JSON-объект). Участников РОВНО ДВА." if lang=="ru" else "Summarize dialogue essence (structured JSON object). Exactly TWO participants.",
            "participants": participants,
            "hints": speaker_hints or "",
            "instructions": {
                "participants": "ровно 2 участника; используй канонические имена из hints/author",
                "memories": "долговременные сведения о людях: устойчивые предпочтения, роли, био-факты, повторяющиеся паттерны",
                "entities": "третьи лица, места и объекты; связи subject-predicate-object",
            },
            "messages": messages,
            "schema": {
                "participants": [{"id":"string","name":"string","stance":["string"]}],
                "summary": "string",
                "tags": ["string"],
                "memories": [{"speaker_id":"string","text":"string","durability":"long|short"}],
                "entities": [{"name":"string","type":"person|org|place|other","aliases":["string"],
                               "relations":[{"subject":"string","predicate":"string","object":"string","durability":"long|short","when":"string?"}]}],
                "alias_map": {"string":"string"}
            }
        }
        return json.dumps(payload, ensure_ascii=False)

    @staticmethod
    def _parse_llm_json(s: str) -> Optional[Dict[str, Any]]:
        if not s:
            return None
        try:
            data = json.loads(s)
            if isinstance(data, dict) and "summary" in data:
                return data
        except Exception:
            pass
        m = re.search(r"(\{.*\})", s, flags=re.DOTALL)
        if m:
            try:
                data = json.loads(m.group(1))
                if isinstance(data, dict) and "summary" in data:
                    return data
            except Exception:
                return None
        return None

    def _call_llm_openai(self, sys_prompt: str, user_prompt: str) -> str:
        resp = self._openai.chat.completions.create(
            model=self.model,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":sys_prompt},{"role":"user","content":user_prompt}],
            temperature=0.2,
        )
        return resp.choices[0].message.content or ""

    def _call_llm_ollama(self, sys_prompt: str, user_prompt: str) -> str:
        url = f"{self._ollama_url}/api/chat"
        payload = {"model": self.model, "messages": [{"role":"system","content":sys_prompt},{"role":"user","content":user_prompt}], "format":"json", "stream":False}
        r = requests.post(url,json=payload,timeout=120)
        r.raise_for_status()
        return (r.json().get("message") or {}).get("content", "")

    async def extract(self, messages: List[Dict[str,Any]]) -> Optional[Dict[str,Any]]:
        sys_p = self._prompt_system(self.prompt_lang)
        speaker_hints = os.getenv("SPEAKER_HINTS", "")
        user_p = self._prompt_user(messages, self.prompt_lang, speaker_hints)
        if self.provider=="openai":
            txt = self._call_llm_openai(sys_p,user_p)
        else:
            txt = self._call_llm_ollama(sys_p,user_p)
        return self._parse_llm_json(txt)

# ----------------- Чтение CSV -----------------
def load_messages_csv(path: str, limit_rows:int)->pd.DataFrame:
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    df=pd.read_csv(path)
    if "is_system" in df.columns:
        df=df[df["is_system"]==0]
    if "session_id" not in df.columns:
        df["session_id"]="default"
    if "ts" in df.columns:
        df["ts_parsed"]=pd.to_datetime(df["ts"],errors="coerce")
        df=df.sort_values(["session_id","ts_parsed","id"],kind="mergesort").drop(columns=["ts_parsed"])
    df=df[["id","author","text","session_id"]].dropna(subset=["author","text"])
    smap=os.getenv("SPEAKER_MAP","")
    if smap:
        try:
            mapping_json=json.loads(smap)
            rev={alias:canon for canon,aliases in mapping_json.items() for alias in ([canon]+aliases)}
            df["author"]=df["author"].map(lambda x: rev.get(str(x), str(x)))
        except Exception:
            pass
    if limit_rows>0:
        df=df.head(limit_rows)
    return df

def iter_chunks(df: pd.DataFrame, chunk_size:int, stride:int):
    if stride <= 0:
        stride = max(1, chunk_size // 2)
    rows = df.to_dict(orient="records")
    n = len(rows)
    i = 0
    while i < n:
        j = min(i + chunk_size, n)
        if j - i < 3:
            break
        yield "all", rows[i:j]
        if j >= n:
            break
        i += stride

# ----------------- Main -----------------
async def main():
    load_dotenv(override=True)

    def _get_int_env(name: str, default: int) -> int:
        raw = os.getenv(name, None)
        if raw is None or str(raw).strip() == "":
            return default
        m = re.search(r"-?\d+", str(raw))
        return int(m.group(0)) if m else default
    LLM_PROVIDER=os.getenv("LLM_PROVIDER","ollama")
    OLLAMA_BASE_URL=os.getenv("OLLAMA_BASE_URL","http://localhost:11434")
    LLM_MODEL=os.getenv("LLM_MODEL_NAME","qwen3:8b")
    OPENAI_API_KEY=os.getenv("OPENAI_API_KEY","").strip()
    EMB_MODEL=os.getenv("EMBEDDING_MODEL_NAME","text-embedding-3-small")
    MESSAGES_CSV=os.getenv("MESSAGES_CSV","messages.csv")
    DRY_RUN=os.getenv("DRY_RUN","1")=="1"
    OUTPUT_JSON_PATH=os.getenv("OUTPUT_JSON_PATH","facts_sample.jsonl")
    LIMIT_ROWS=int(os.getenv("LIMIT_ROWS","300"))
    CHUNK_SIZE=int(os.getenv("CHUNK_SIZE", "150"))
    STRIDE=int(os.getenv("STRIDE","25"))
    CHUNK_TIMEOUT=int(os.getenv("CHUNK_TIMEOUT","60"))
    LONGTERM_ONLY=os.getenv("LONGTERM_ONLY","1")=="1"
    DEDUP=os.getenv("DEDUP","1")=="1"
    READABLE_REPORT=os.getenv("READABLE_REPORT","out/facts_readable.md")

    embedder=OpenAIEmbedder(api_key=OPENAI_API_KEY,emb_model=EMB_MODEL)
    extractor=LLMExtractor(provider=LLM_PROVIDER,model=LLM_MODEL,openai_api_key=OPENAI_API_KEY if LLM_PROVIDER=="openai" else None,ollama_base_url=OLLAMA_BASE_URL)

    df=load_messages_csv(MESSAGES_CSV,LIMIT_ROWS)
    print(f"[INFO] Loaded {len(df)} rows", flush=True)
    print(f"[INFO] CHUNK_SIZE={CHUNK_SIZE} STRIDE={STRIDE}", flush=True)

    os.makedirs(os.path.dirname(OUTPUT_JSON_PATH) or ".",exist_ok=True)

    results=[]
    seen_keys=set()
    chunks=list(iter_chunks(df,CHUNK_SIZE,STRIDE))
    print(f"[INFO] Chunks to process: {len(chunks)}", flush=True)
    for idx,(sess_id,chunk) in enumerate(tqdm(chunks, desc="Extract", unit="chunk")):
        print(f"[DBG] -> chunk#{idx} size={len(chunk)} start", flush=True)
        try:
            persona=await asyncio.wait_for(extractor.extract(chunk), timeout=CHUNK_TIMEOUT)
        except asyncio.TimeoutError:
            print(f"[WARN] <- chunk#{idx} timeout after {CHUNK_TIMEOUT}s", flush=True)
            continue
        if not persona:
            print(f"[DBG] <- chunk#{idx} no persona (empty/parse fail)", flush=True)
            continue
        print(f"[DBG] <- chunk#{idx} persona ok", flush=True)
        semantic = persona.get("summary", "")
        mems = persona.get("memories") or []
        for m in mems:
            if LONGTERM_ONLY and (m.get("durability") == "short"):
                continue
            who = m.get("speaker_id", "?")
            txt = (m.get("text") or "").strip()
            if txt:
                semantic += f"\nMem {who}: {txt}"
        for p in (persona.get("participants") or []):
            if isinstance(p, dict):
                name = (p.get("name") or p.get("id") or "?")
                stance_val = p.get("stance", [])
            else:
                name = str(p)
                stance_val = []
            if isinstance(stance_val, str):
                stance_list = [stance_val.strip()] if stance_val.strip() else []
            else:
                stance_list = [s for s in (stance_val or []) if isinstance(s, str) and s.strip()]
            st = "; ".join(stance_list)
            if st:
                semantic += f"\n{name}: {st}"
        rel_lines = []
        for ent in (persona.get("entities") or []):
            ename = ent.get("name")
            for rel in (ent.get("relations") or []):
                if LONGTERM_ONLY and (rel.get("durability") == "short"):
                    continue
                subj = (rel.get("subject") or "").strip()
                pred = (rel.get("predicate") or "").strip()
                obj = (rel.get("object") or "").strip()
                when = rel.get("when")
                if pred and (subj or obj or ename):
                    left = subj or ename or "?"
                    right = obj or ename or "?"
                    line = f"Rel: {left} — {pred} — {right}"
                    if when:
                        line += f" ({when})"
                    rel_lines.append(line)
        for line in rel_lines[:5]:
            semantic += f"\n{line}"
        rec_alias = {"alias_map": persona.get("alias_map")} if persona.get("alias_map") else {}
        # дедуп по смысловой выжимке
        dedup_key = hashlib.sha1(clean_ws(semantic).lower().encode("utf-8")).hexdigest()
        if DEDUP and dedup_key in seen_keys:
            print(f"[DBG] <- chunk#{idx} skipped as duplicate", flush=True)
            continue
        seen_keys.add(dedup_key)
        # диапазон id в чанке (для читаемого отчёта)
        ids_in_chunk = [int(r.get('id', 0)) for r in chunk if str(r.get('id','')).isdigit()]
        start_id = min(ids_in_chunk) if ids_in_chunk else None
        end_id = max(ids_in_chunk) if ids_in_chunk else None
        rec={"point_id":str(uuid.uuid5(NAMESPACE_UUID,str(chunk[0]['id']))),
             "session_id":sess_id,
             "chunk_index": idx,
             "chunk_first_id": start_id,
             "chunk_last_id": end_id,
             "semantic_summary":semantic,
             "persona":persona,
             "dedup_key": dedup_key,
             **rec_alias}
        results.append(rec)

    if DRY_RUN:
        with open(OUTPUT_JSON_PATH,"w",encoding="utf-8") as f:
            for r in results:
                vec=embedder.embed(r["semantic_summary"])
                out=dict(r)
                out["embedding"]=vec
                f.write(json.dumps(out,ensure_ascii=False)+"\n")
        print(f"[INFO] Saved {len(results)} records to {OUTPUT_JSON_PATH}")
        # Дополнительно — читаемый отчёт в Markdown
        try:
            os.makedirs(os.path.dirname(READABLE_REPORT) or ".", exist_ok=True)
            with open(READABLE_REPORT, "w", encoding="utf-8") as rf:
                rf.write(f"# Диалог: долговременная база (дедуп={int(DEDUP)})")
                for r in results:
                    p = r.get("persona", {})
                    rf.write(f"## Чанк #{r.get('chunk_index')} (id {r.get('chunk_first_id')}–{r.get('chunk_last_id')})")
                    # Summary
                    rf.write("### Summary" + (p.get("summary") or "") + "")
                    # Stances
                    parts = p.get("participants") or []
                    st_lines=[]
                    for item in parts:
                        if isinstance(item, dict):
                            nm = item.get("name") or item.get("id") or "?"
                            st = "; ".join(item.get("stance") or [])
                        else:
                            nm = str(item)
                            st = ""
                        if st:
                            st_lines.append(f"- **{nm}:** {st}")
                    if st_lines:
                        rf.write("### Stances" + "".join(st_lines) + "")
                    # Long memories
                    mems = []
                    for m in (p.get("memories") or []):
                        if LONGTERM_ONLY and (m.get("durability") == "short"):
                            continue
                        who = m.get("speaker_id", "?")
                        txt = (m.get("text") or "").strip()
                        if txt:
                            mems.append(f"- **{who}:** {txt}")
                    if mems:
                        rf.write("### Long memories" + "".join(mems) + "")
                    # Relations (long-only)
                    rels=[]
                    for ent in (p.get("entities") or []):
                        en = ent.get("name")
                        for rel in (ent.get("relations") or []):
                            if LONGTERM_ONLY and (rel.get("durability") == "short"):
                                continue
                            subj = rel.get("subject") or en or "?"
                            pred = rel.get("predicate") or ""
                            obj  = rel.get("object") or en or "?"
                            if pred:
                                rels.append(f"- **{subj} — {pred} — {obj}**")
                    if rels:
                        rf.write("### Relations" + "".join(rels) + "")
                    # Entities
                    ents = p.get("entities") or []
                    if ents:
                        rf.write("### Entities")
                        for e in ents:
                            en=e.get("name") or "?"
                            et=e.get("type") or "?"
                            als=", ".join(e.get("aliases") or [])
                            if als:
                                rf.write(f"- **{en}** (_{et}_) — aliases: {als}")
                            else:
                                rf.write(f"- **{en}** (_{et}_)")
                        rf.write("")
                    # Alias map
                    amap = p.get("alias_map") or r.get("alias_map") or {}
                    if amap:
                        rf.write("### Alias map")
                        for k,v in amap.items():
                            rf.write(f"- **{k}** → {v}")
                        rf.write("")
            print(f"[INFO] Readable report saved to {READABLE_REPORT}")
        except Exception as e:
            print(f"[WARN] Failed to write readable report: {e}")
    else:
        q_url=os.getenv("QDRANT_URL","http://localhost:6333")
        qdrant=QdrantClient(url=q_url)
        vtmp=embedder.embed("probe")
        recreate_collection(qdrant,os.getenv("CONVERSATION_FACTS_COLLECTION","conversation_facts"),len(vtmp))
        pts=[qmodels.PointStruct(id=r["point_id"],vector=embedder.embed(r["semantic_summary"]),payload=r) for r in results]
        qdrant.upsert(collection_name=os.getenv("CONVERSATION_FACTS_COLLECTION","conversation_facts"),points=pts)
        print(f"[INFO] Upserted {len(results)} records")

if __name__=="__main__":
    asyncio.run(main())
