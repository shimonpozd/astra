#!/usr/bin/env python3
import sys, math
import pandas as pd
from datetime import datetime

messages_csv = r"/mnt/data/messages.csv"
utterances_csv = r"/mnt/data/utterances.csv"
edges_mentions_csv = r"/mnt/data/edges_mentions.csv"
concepts_csv = r"/mnt/data/concepts.csv"

def build_context(session_id: str, tau: float = 1800.0):
    msgs = pd.read_csv(messages_csv)
    utts = pd.read_csv(utterances_csv)
    mentions = pd.read_csv(edges_mentions_csv)
    concepts = pd.read_csv(concepts_csv)

    msgs_ns = msgs[msgs["is_system"] == 0].copy()
    msgs_ns["ts_dt"] = pd.to_datetime(msgs_ns["ts"])

    sess = msgs_ns[msgs_ns["session_id"] == session_id].sort_values("ts_dt")
    if sess.empty:
        return f"[Error] session_id {session_id} not found."

    sess_last_ts = sess["ts_dt"].max()
    sess_utt_ids = set(sess["id"].tolist())

    # Topic scores with decay
    m_sess = mentions[mentions["utt_id"].isin(sess_utt_ids)].copy()
    top_topics = []
    if not m_sess.empty:
        ts_map = msgs_ns.set_index("id")["ts_dt"]
        m_sess["ts_dt"] = m_sess["utt_id"].map(ts_map)
        def decay_weight(row):
            dt = row["ts_dt"]
            w0 = float(row.get("w0", 0.7))
            delta = (sess_last_ts - dt).total_seconds()
            return w0 * math.exp(-delta / tau)
        m_sess["w"] = m_sess.apply(decay_weight, axis=1)
        topic_scores = m_sess.groupby("topic_id")["w"].sum().sort_values(ascending=False)
        top_topics = topic_scores.head(3).index.tolist()

    # Recent 2
    u_map = utts.set_index("utt_id")[["speaker","text"]]
    recent = []
    for mid in sess.sort_values("ts_dt").tail(2)["id"].tolist():
        if mid in u_map.index:
            speaker = u_map.loc[mid, "speaker"]
            text = str(u_map.loc[mid, "text"]).strip().replace("\n"," ")
            if len(text) > 200:
                text = text[:199].rstrip() + "…"
            recent.append(f"{speaker}: “{text}”")

    # Knowledge
    facts = []
    if not concepts.empty and top_topics:
        for t in top_topics:
            cands = concepts[concepts["topic_id"].str.lower() == str(t).lower()]
            for _, row in cands.head(1).iterrows():
                fact = str(row["fact"]).strip()
                if fact:
                    facts.append(f"{t}: {fact}")
            if len(facts) >= 2:
                break

    parts = []
    if top_topics:
        parts.append("[Topics] " + ", ".join(top_topics))
    if recent:
        parts.append("[Recent] " + " | ".join(recent))
    if facts:
        parts.append("[Knowledge] " + " | ".join(facts))
    return "\n".join(parts)

if __name__ == "__main__":
    if len(sys.argv) == 1:
        # choose last session by default
        msgs = pd.read_csv(messages_csv)
        msgs_ns = msgs[msgs["is_system"] == 0].copy()
        msgs_ns["ts_dt"] = pd.to_datetime(msgs_ns["ts"])
        last_session_id = msgs_ns.sort_values("ts_dt").iloc[-1]["session_id"]
        print(build_context(last_session_id))
    else:
        print(build_context(sys.argv[1]))
