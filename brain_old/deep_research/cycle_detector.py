#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Smart cycle detection for tool-using agents.
"""

import json
import logging
from collections import deque, Counter
from typing import Dict, List, Any, Tuple

class SmartCycleDetector:
    """
    An intelligent cycle detector that distinguishes between productive and unproductive repetitions.
    """
    
    def __init__(self, max_history: int = 6):
        self.tool_call_history = deque(maxlen=max_history)
        self.argument_patterns = deque(maxlen=max_history)
        self.productive_threshold = 3  # How many repetitions of one tool are permissible
        
    def add_tool_calls(self, tool_calls: List[Dict[str, Any]]) -> None:
        if not tool_calls:
            return
            
        call_signature = self._create_call_signature(tool_calls)
        self.tool_call_history.append(call_signature)
        
        arg_pattern = self._create_argument_pattern(tool_calls)
        self.argument_patterns.append(arg_pattern)
    
    def _create_call_signature(self, tool_calls: List[Dict[str, Any]]) -> str:
        signatures = []
        for call in tool_calls:
            function = call.get("function", {})
            name = function.get("name", "unknown")
            
            try:
                args = json.loads(function.get("arguments", "{}"))
                if name == "sefaria_get_text":
                    ref = args.get("ref", "")
                    signatures.append(f"{name}({ref})")
                elif name == "sefaria_get_links":
                    ref = args.get("ref", "")
                    categories = args.get("categories", [])
                    cat_sig = ",".join(sorted(categories[:3]))
                    signatures.append(f"{name}({ref},{cat_sig})")
                elif name == "recall_research_sources":
                    query = args.get("query", "")[:20]
                    signatures.append(f"{name}({query})")
                else:
                    signatures.append(name)
            except (json.JSONDecodeError, AttributeError):
                signatures.append(name)
                
        return "|".join(sorted(signatures))
    
    def _create_argument_pattern(self, tool_calls: List[Dict[str, Any]]) -> Dict[str, int]:
        pattern = Counter()
        for call in tool_calls:
            function = call.get("function", {})
            name = function.get("name", "unknown")
            pattern[name] += 1
            
            if name in ["sefaria_get_text", "sefaria_get_links"]:
                try:
                    args = json.loads(function.get("arguments", "{}"))
                    ref = args.get("ref", "")
                    if ref:
                        pattern[f"{name}_ref_{ref}"] += 1
                except (json.JSONDecodeError, AttributeError):
                    pass
        return pattern
    
    def should_break_cycle(self) -> bool:
        """
        Detects if a cycle is occurring. Now triggers on 3+ repetitions.
        """
        # Need at least 3 calls to detect a 3-repeat cycle
        if len(self.tool_call_history) < 3:
            return False

        # Check for simple repeats (A, A, A)
        if (
            self.tool_call_history[-1] == self.tool_call_history[-2]
            and self.tool_call_history[-2] == self.tool_call_history[-3]
        ):
            logger.warning("Cycle detected: 3 consecutive identical tool calls.")
            return True

        # Check for 3-step pattern repeats (A, B, C, A, B, C)
        if len(self.tool_call_history) >= 6:
            if list(self.tool_call_history)[-3:] == list(self.tool_call_history)[-6:-3]:
                logger.warning("Cycle detected: 3-step pattern repeated.")
                return True

        return False
