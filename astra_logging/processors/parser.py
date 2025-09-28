"""Intelligent log line parser with multiple format support."""

import re
from datetime import datetime
from typing import Optional, List, Tuple, Pattern, Callable
from ..core.models import LogEntry, LogLevel
from ..core.exceptions import ParsingError


class LogLineParser:
    """Intelligent log line parser with multiple format support."""

    def __init__(self):
        # Precompiled regex patterns for different log formats
        self._patterns: List[Tuple[Pattern, Callable]] = [
            # Format 1: Python logging - 2025-09-18 15:05:53,123 - brain-service - INFO - message
            (re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:,(\d{3}))? - ([^-]+) - (\w+) - (.+)'),
             self._parse_python_logging),
            # Format 2: Bracketed format - [15:05:53.123] [brain] [INFO] message
            (re.compile(r'\[(\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\] \[([^\]]+)\] \[(\w+)\] (.+)'),
             self._parse_bracketed),
            # Format 3: Uvicorn format - INFO:     127.0.0.1:52856 - "GET /health HTTP/1.1" 200 OK
            (re.compile(r'(\w+):\s+(.+)'), self._parse_uvicorn),
            # Format 4: Simple timestamp - 15:05:53 INFO message
            (re.compile(r'(\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\s+(\w+)\s+(.+)'),
             self._parse_simple_timestamp),
            # Format 5: Fallback - any line
            (re.compile(r'(.+)'), self._parse_fallback)
        ]

        # Level detection patterns
        self._level_keywords = {
            LogLevel.DEBUG: ['debug', 'trace', 'verbose'],
            LogLevel.INFO: ['info', 'starting', 'started', 'listening', 'ready'],
            LogLevel.WARNING: ['warn', 'warning', 'deprecated', 'attention'],
            LogLevel.ERROR: ['error', 'failed', 'exception', 'traceback', 'err'],
            LogLevel.CRITICAL: ['critical', 'fatal', 'crash', 'abort', 'panic']
        }

        # Precompile level detection patterns
        self._compiled_level_patterns = {}
        for level, keywords in self._level_keywords.items():
            self._compiled_level_patterns[level] = [
                re.compile(r'\b' + re.escape(keyword) + r'\b', re.IGNORECASE)
                for keyword in keywords
            ]

    def parse(self, line: str, service_name: str) -> Optional[LogEntry]:
        """Parse log line into structured LogEntry."""
        line = line.strip()
        if not line:
            return None

        for pattern, parser_func in self._patterns:
            match = pattern.match(line)
            if match:
                try:
                    return parser_func(match, service_name, line)
                except Exception as e:
                    # Log parsing error but continue with next pattern
                    continue

        return None

    def _detect_level(self, text: str) -> LogLevel:
        """Detect log level from text content using precompiled patterns."""
        text_lower = text.lower()

        for level, patterns in self._compiled_level_patterns.items():
            for pattern in patterns:
                if pattern.search(text):
                    return level

        return LogLevel.INFO  # Default

    def _parse_python_logging(self, match, service_name: str, raw_line: str) -> LogEntry:
        """Parse Python logging format: 2025-09-18 15:05:53,123 - brain-service - INFO - message"""
        date_str, millis, _, level_str, message = match.groups()

        # Parse timestamp
        if millis:
            timestamp_str = f"{date_str}.{millis}"
            timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S.%f')
        else:
            timestamp = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')

        # Parse level
        try:
            level = LogLevel(level_str.upper())
        except ValueError:
            level = self._detect_level(message)

        return LogEntry(
            timestamp=timestamp,
            service=service_name,
            level=level,
            message=message.strip(),
            raw_line=raw_line
        )

    def _parse_bracketed(self, match, service_name: str, raw_line: str) -> LogEntry:
        """Parse bracketed format: [15:05:53.123] [brain] [INFO] message"""
        time_str, parsed_service, level_str, message = match.groups()

        # Use current date with parsed time
        now = datetime.now()
        if '.' in time_str:
            time_obj = datetime.strptime(time_str, '%H:%M:%S.%f').time()
        else:
            time_obj = datetime.strptime(time_str, '%H:%M:%S').time()

        timestamp = datetime.combine(now.date(), time_obj)

        # Parse level
        try:
            level = LogLevel(level_str.upper())
        except ValueError:
            level = self._detect_level(message)

        return LogEntry(
            timestamp=timestamp,
            service=parsed_service or service_name,
            level=level,
            message=message.strip(),
            raw_line=raw_line
        )

    def _parse_uvicorn(self, match, service_name: str, raw_line: str) -> LogEntry:
        """Parse Uvicorn format: INFO:     127.0.0.1:52856 - "GET /health HTTP/1.1" 200 OK"""
        level_str, message = match.groups()

        try:
            level = LogLevel(level_str.upper())
        except ValueError:
            level = self._detect_level(message)

        return LogEntry(
            timestamp=datetime.now(),
            service=service_name,
            level=level,
            message=message.strip(),
            raw_line=raw_line
        )

    def _parse_simple_timestamp(self, match, service_name: str, raw_line: str) -> LogEntry:
        """Parse simple timestamp format: 15:05:53 INFO message"""
        time_str, level_str, message = match.groups()

        # Use current date with parsed time
        now = datetime.now()
        if '.' in time_str:
            time_obj = datetime.strptime(time_str, '%H:%M:%S.%f').time()
        else:
            time_obj = datetime.strptime(time_str, '%H:%M:%S').time()

        timestamp = datetime.combine(now.date(), time_obj)

        try:
            level = LogLevel(level_str.upper())
        except ValueError:
            level = self._detect_level(message)

        return LogEntry(
            timestamp=timestamp,
            service=service_name,
            level=level,
            message=message.strip(),
            raw_line=raw_line
        )

    def _parse_fallback(self, match, service_name: str, raw_line: str) -> LogEntry:
        """Fallback parser for unrecognized formats."""
        message, = match.groups()
        level = self._detect_level(message)

        return LogEntry(
            timestamp=datetime.now(),
            service=service_name,
            level=level,
            message=message.strip(),
            raw_line=raw_line
        )

    def add_custom_parser(self, pattern: str, parser_func: Callable) -> None:
        """Add custom parser for specific log format."""
        try:
            compiled_pattern = re.compile(pattern)
            self._patterns.insert(-1, (compiled_pattern, parser_func))  # Insert before fallback
        except re.error as e:
            raise ParsingError(f"Invalid regex pattern '{pattern}': {e}")

    def get_supported_formats(self) -> List[str]:
        """Get list of supported log formats."""
        return [
            "Python logging: 2025-09-18 15:05:53,123 - service - LEVEL - message",
            "Bracketed: [15:05:53.123] [service] [LEVEL] message",
            "Uvicorn: LEVEL: message",
            "Simple timestamp: 15:05:53 LEVEL message",
            "Fallback: any text"
        ]
