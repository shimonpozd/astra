import math
import time
from collections import defaultdict
from typing import List, Dict, Any, Set

from .config import settings

# --- HELPER FUNCTIONS ---

def _get_tokens(text: str) -> Set[str]:
    """A simple tokenizer to split text into a set of lowercased words."""
    return set(text.lower().split())

def _calculate_jaccard(set1: Set[str], set2: Set[str]) -> float:
    """Calculates the Jaccard similarity between two sets of tokens."""
    if not set1 and not set2:
        return 0.0
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.0

def _calculate_noise_penalty(fact: Dict[str, Any]) -> float:
    """Calculates a penalty score for noisy or low-value facts."""
    text = fact.get("text", "").lower()
    fact_type = fact.get("fact_type", "")
    penalty = 0.0
    
    # Penalty for short facts
    if len(text) < 25:
        penalty += 0.15
        
    # Penalty for conversational fluff
    fluff_words = {"привет", "пока", "устал", "ушёл", "ок", "ладно"}
    if any(word in text for word in fluff_words):
        penalty += 0.2
        
    # Penalty for meta-facts
    meta_fact_types = {"greeting", "mood", "meta"}
    if fact_type in meta_fact_types:
        penalty += 0.3
        
    return penalty

# --- MAIN FUSION LOGIC ---

def fuse_and_rerank(
    candidate_sets: Dict[str, List[Dict[str, Any]]],
    user_speaker_name: str,
    query: str,
    recent_topics: List[str],
    recent_entities: List[str]
) -> List[Dict[str, Any]]:
    """
    Performs hybrid fusion and re-ranking of candidate facts.
    """
    
    # 1. Deduplicate and gather all unique facts
    all_facts: Dict[str, Dict[str, Any]] = {}
    for source, facts in candidate_sets.items():
        for fact in facts:
            fact_id = fact.get("fact_id")
            if fact_id and fact_id not in all_facts:
                fact['source'] = source
                all_facts[fact_id] = fact

    query_tokens = _get_tokens(query)
    final_results = []

    # 2. Calculate hybrid score for each unique fact
    for fact_id, fact in all_facts.items():
        # Base scores from different search branches
        sem_score = fact.get("confidence", 0.0) if fact['source'] == 'qdrant_semantic' else 0.0
        kw_score = _calculate_jaccard(query_tokens, _get_tokens(fact.get("text", "")))
        
        # Topic & Entity Score (simple binary for now)
        topic_score = 0.0
        fact_topics = fact.get("topic_slugs", [])
        if any(t in recent_topics for t in fact_topics):
            topic_score = 1.0

        # Context Bonus
        ctx_bonus = 0.0
        if fact.get("speaker") == user_speaker_name:
            ctx_bonus += 0.05
        if any(t in recent_topics for t in fact_topics):
            ctx_bonus += 0.15
        if any(e in recent_entities for e in fact.get("entity_slugs", [])):
            ctx_bonus += 0.15

        # Noise Penalty
        noise_penalty = _calculate_noise_penalty(fact)

        # Hybrid Formula
        final_score = (
            settings.fusion_weight_dense * sem_score +
            settings.fusion_weight_keyword * kw_score +
            settings.fusion_weight_neo4j_topic * topic_score + # Re-using neo4j topic weight for general topic score
            0.10 * ctx_bonus - # Weight for context bonus as per user plan
            noise_penalty
        )
        
        fact['final_score'] = final_score
        final_results.append(fact)

    # 3. Filter out low-scoring and deduplicate results
    final_results.sort(key=lambda x: x['final_score'], reverse=True)
    
    # Simple deduplication based on Jaccard similarity
    deduped_results = []
    seen_fact_tokens: List[Set[str]] = []
    for fact in final_results:
        if fact['final_score'] < 0.42: # Threshold from user plan
            continue
            
        is_duplicate = False
        current_fact_tokens = _get_tokens(fact.get("text", ""))
        for seen_tokens in seen_fact_tokens:
            if _calculate_jaccard(current_fact_tokens, seen_tokens) >= 0.8:
                is_duplicate = True
                break
        
        if not is_duplicate:
            deduped_results.append(fact)
            seen_fact_tokens.append(current_fact_tokens)

    # 4. Return the top N results as defined in settings
    return deduped_results[:settings.recall_limit]
