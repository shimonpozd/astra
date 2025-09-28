import time
from collections import defaultdict
import numpy as np

class MetricsCollector:
    def __init__(self):
        self.recall_latencies = []
        self.cache_hits = 0
        self.cache_misses = 0
        self.errors = defaultdict(int)
        self.proactive_suggestions_offered = 0
        self.proactive_tactics_suggested = defaultdict(int)
        self.context_build_latencies = []
        self.pointer_lengths = []
        self.qdrant_query_latencies = []
        self.start_time = time.time()

    def record_recall_latency(self, duration: float):
        self.recall_latencies.append(duration)
        if len(self.recall_latencies) > 1000:
            self.recall_latencies.pop(0)

    def record_cache_hit(self):
        self.cache_hits += 1

    def record_cache_miss(self):
        self.cache_misses += 1

    def record_error(self, error_type: str):
        self.errors[error_type] += 1

    def record_proactive_suggestion(self):
        self.proactive_suggestions_offered += 1

    def record_tactic_suggested(self, tactic: str):
        self.proactive_tactics_suggested[tactic] += 1

    def record_context_build(self, duration: float, length: int):
        self.context_build_latencies.append(duration)
        self.pointer_lengths.append(length)
        if len(self.context_build_latencies) > 1000:
            self.context_build_latencies.pop(0)
            self.pointer_lengths.pop(0)

    def record_qdrant_query(self, duration: float):
        self.qdrant_query_latencies.append(duration)
        if len(self.qdrant_query_latencies) > 1000:
            self.qdrant_query_latencies.pop(0)

    def get_report(self):
        uptime_seconds = time.time() - self.start_time
        latencies_np = np.array(self.recall_latencies)
        context_build_latencies_np = np.array(self.context_build_latencies)
        pointer_lengths_np = np.array(self.pointer_lengths)
        qdrant_latencies_np = np.array(self.qdrant_query_latencies)

        proactive_report = {
            "suggestions_offered_total": self.proactive_suggestions_offered,
            "tactics_suggested_counts": dict(self.proactive_tactics_suggested)
        }
        
        return {
            "uptime_seconds": uptime_seconds,
            "recall_requests_total": len(self.recall_latencies),
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "cache_hit_ratio": self.cache_hits / (self.cache_hits + self.cache_misses) if (self.cache_hits + self.cache_misses) > 0 else 0,
            "errors": dict(self.errors),
            "proactive_suggestions": proactive_report,
            "context_build_latency_p99_ms": np.percentile(context_build_latencies_np, 99) * 1000 if len(context_build_latencies_np) > 0 else 0,
            "qdrant_query_latency_p99_ms": np.percentile(qdrant_latencies_np, 99) * 1000 if len(qdrant_latencies_np) > 0 else 0,
            "pointer_length_avg_chars": np.mean(pointer_lengths_np) if len(pointer_lengths_np) > 0 else 0,
            "recall_latency_p50_ms": np.percentile(latencies_np, 50) * 1000 if len(latencies_np) > 0 else 0,
            "recall_latency_p90_ms": np.percentile(latencies_np, 90) * 1000 if len(latencies_np) > 0 else 0,
            "recall_latency_p99_ms": np.percentile(latencies_np, 99) * 1000 if len(latencies_np) > 0 else 0,
        }

# Global instance
metrics_collector = MetricsCollector()

# Wrapper functions to be called from other modules
def record_recall_latency(duration: float):
    metrics_collector.record_recall_latency(duration)

def record_cache_hit():
    metrics_collector.record_cache_hit()

def record_cache_miss():
    metrics_collector.record_cache_miss()

def record_error(error_type: str):
    metrics_collector.record_error(error_type)

def record_proactive_suggestion():
    metrics_collector.record_proactive_suggestion()

def record_tactic_suggested(tactic: str):
    metrics_collector.record_tactic_suggested(tactic)


def record_context_build(duration: float, length: int):
    metrics_collector.record_context_build(duration, length)

def record_qdrant_query(duration: float):
    metrics_collector.record_qdrant_query(duration)