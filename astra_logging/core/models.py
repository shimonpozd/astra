"""Data models for Astra logging system."""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any


class LogLevel(Enum):
    """Log level enumeration."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

    @property
    def priority(self) -> int:
        """Get numeric priority for level comparison."""
        priorities = {
            LogLevel.DEBUG: 10,
            LogLevel.INFO: 20,
            LogLevel.WARNING: 30,
            LogLevel.ERROR: 40,
            LogLevel.CRITICAL: 50
        }
        return priorities[self]


@dataclass
class LogEntry:
    """Structured log entry with all necessary metadata."""

    timestamp: datetime
    service: str
    level: LogLevel
    message: str
    raw_line: str
    thread_id: Optional[str] = None
    process_id: Optional[int] = None
    extra_data: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        """Validate data after initialization."""
        if not self.service:
            raise ValueError("Service name cannot be empty")
        if not self.message:
            raise ValueError("Message cannot be empty")
        if not isinstance(self.level, LogLevel):
            raise ValueError("Level must be a LogLevel enum")

    @property
    def formatted_timestamp(self) -> str:
        """Get formatted timestamp string."""
        return self.timestamp.strftime("%H:%M:%S.%f")[:-3]

    @property
    def is_error(self) -> bool:
        """Check if this is an error-level log."""
        return self.level in (LogLevel.ERROR, LogLevel.CRITICAL)

    @property
    def is_warning(self) -> bool:
        """Check if this is a warning-level log."""
        return self.level == LogLevel.WARNING

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "service": self.service,
            "level": self.level.value,
            "message": self.message,
            "raw_line": self.raw_line,
            "thread_id": self.thread_id,
            "process_id": self.process_id,
            "extra_data": self.extra_data
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LogEntry':
        """Create LogEntry from dictionary."""
        data_copy = data.copy()
        data_copy['timestamp'] = datetime.fromisoformat(data['timestamp'])
        data_copy['level'] = LogLevel(data['level'])
        return cls(**data_copy)


@dataclass
class ServiceStatus:
    """Status information for a service."""

    name: str
    status: str  # ✓, ⚠, ✗, ?
    message_count: int
    level_counts: Dict[LogLevel, int]
    last_message: str
    last_update: datetime

    @property
    def error_count(self) -> int:
        """Get total error count."""
        return (self.level_counts.get(LogLevel.ERROR, 0) +
                self.level_counts.get(LogLevel.CRITICAL, 0))

    @property
    def has_recent_errors(self) -> bool:
        """Check if service has recent errors."""
        return self.error_count > 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "status": self.status,
            "message_count": self.message_count,
            "level_counts": {k.value: v for k, v in self.level_counts.items()},
            "last_message": self.last_message,
            "last_update": self.last_update.isoformat()
        }
