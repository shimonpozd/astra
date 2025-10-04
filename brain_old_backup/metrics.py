from collections import defaultdict
import numpy as np
import time

class BrainMetrics:
    def __init__(self):
        self.tool_calls = defaultdict(int)
        self.tool_errors = defaultdict(lambda: defaultdict(int))
        self.tool_latencies = defaultdict(list)
        self.tool_output_sizes = defaultdict(list)
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.total_tokens = 0
        self.start_time = time.time()

    def record_tool_latency(self, tool_name: str, duration: float):
        self.tool_latencies[tool_name].append(duration)

    def record_tool_error(self, tool_name: str, error_type: str):
        self.tool_errors[tool_name][error_type] += 1

    def record_tool_call(self, tool_name: str):
        self.tool_calls[tool_name] += 1

    def record_tool_output_size(self, tool_name: str, size_in_bytes: int):
        self.tool_output_sizes[tool_name].append(size_in_bytes)

    def record_token_usage(self, usage):
        if usage:
            self.prompt_tokens += usage.prompt_tokens
            self.completion_tokens += usage.completion_tokens
            self.total_tokens += usage.total_tokens

    def get_report(self):
        report = {
            "uptime_seconds": time.time() - self.start_time,
            "token_usage": {
                "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
                "total_tokens": self.total_tokens
            },
            "tool_calls": dict(self.tool_calls),
            "tool_errors": {k: dict(v) for k, v in self.tool_errors.items()},
            "tool_latencies_ms": {},
            "tool_output_size_bytes": {},
        }
        for tool_name, latencies in self.tool_latencies.items():
            if latencies:
                lat_array = np.array(latencies)
                report["tool_latencies_ms"][tool_name] = {
                    "p50": np.percentile(lat_array, 50) * 1000,
                    "p99": np.percentile(lat_array, 99) * 1000,
                    "avg": np.mean(lat_array) * 1000
                }
        
        for tool_name, sizes in self.tool_output_sizes.items():
            if sizes:
                sizes_array = np.array(sizes)
                report["tool_output_size_bytes"][tool_name] = {
                    "avg": np.mean(sizes_array),
                    "max": np.max(sizes_array),
                    "p95": np.percentile(sizes_array, 95)
                }
            
        return report

metrics = BrainMetrics()
