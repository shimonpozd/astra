"""Configuration models for Astra logging system."""

from pathlib import Path
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, validator


class FormattingConfig(BaseModel):
    """Configuration for log formatting."""

    compact_mode: bool = False
    colors: bool = True
    timestamp_format: str = "%H:%M:%S.%f"
    service_width: int = Field(default=10, ge=8, le=20)
    terminal_width: Optional[int] = None

    @validator('timestamp_format')
    def validate_timestamp_format(cls, v):
        """Validate timestamp format string."""
        try:
            from datetime import datetime
            datetime.now().strftime(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid timestamp format: {v}")


class FilterConfig(BaseModel):
    """Configuration for log filtering."""

    exclude_patterns: List[str] = ["healthcheck", "ping"]
    include_only_services: List[str] = []
    min_log_level: str = Field(default="INFO", regex=r'^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$')

    @validator('exclude_patterns')
    def validate_regex_patterns(cls, patterns):
        """Validate regex patterns."""
        import re
        for pattern in patterns:
            try:
                re.compile(pattern)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern '{pattern}': {e}")
        return patterns


class OutputConfig(BaseModel):
    """Configuration for log outputs."""

    console: bool = True
    file: bool = True
    file_path: Path = Path("logs/astra.log")
    rotation_type: str = Field(default="daily", regex=r'^(daily|size:.+|hourly)$')
    max_files: int = Field(default=7, ge=1, le=100)
    buffer_size: int = Field(default=1000, ge=0, le=10000)


class LoggingConfig(BaseModel):
    """Main configuration for Astra logging system."""

    # Core settings
    log_level: str = Field(default="INFO", regex=r'^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$')
    show_status_bar: bool = True

    # Sub-configurations
    formatting: FormattingConfig = FormattingConfig()
    filters: FilterConfig = FilterConfig()
    output: OutputConfig = OutputConfig()

    # Legacy compatibility
    save_to_file: bool = True
    file_path: Path = Path("logs/astra.log")
    rotation: Dict[str, str] = {"type": "daily", "max_files": "7"}
    buffer_size: int = 1000
    no_colors: bool = False
    compact_mode: bool = False

    class Config:
        """Pydantic configuration."""
        validate_assignment = True
        arbitrary_types_allowed = True

    def __init__(self, **data):
        """Initialize with legacy compatibility."""
        # Handle legacy fields
        if 'save_to_file' in data:
            data.setdefault('output', {}).setdefault('file', data['save_to_file'])
        if 'file_path' in data:
            data.setdefault('output', {}).setdefault('file_path', data['file_path'])
        if 'rotation' in data:
            rotation = data['rotation']
            if isinstance(rotation, dict):
                data.setdefault('output', {}).setdefault('rotation_type', rotation.get('type', 'daily'))
                data.setdefault('output', {}).setdefault('max_files', int(rotation.get('max_files', 7)))
        if 'buffer_size' in data:
            data.setdefault('output', {}).setdefault('buffer_size', data['buffer_size'])
        if 'no_colors' in data:
            data.setdefault('formatting', {}).setdefault('colors', not data['no_colors'])
        if 'compact_mode' in data:
            data.setdefault('formatting', {}).setdefault('compact_mode', data['compact_mode'])

        super().__init__(**data)

    @classmethod
    def from_file(cls, path: Path) -> 'LoggingConfig':
        """Load configuration from JSON file."""
        import json
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return cls(**data)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            raise ConfigurationError(f"Failed to load config from {path}: {e}")

    def to_file(self, path: Path):
        """Save configuration to JSON file."""
        import json
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(self.dict(), f, indent=2, default=str)

    def get_log_level_enum(self):
        """Get LogLevel enum from string."""
        from .models import LogLevel
        return LogLevel(self.log_level)

    def should_show_service(self, service_name: str) -> bool:
        """Check if service should be shown based on filters."""
        if self.filters.include_only_services:
            return service_name in self.filters.include_only_services
        return True

    def should_filter_message(self, message: str) -> bool:
        """Check if message should be filtered out."""
        import re
        for pattern in self.filters.exclude_patterns:
            if re.search(pattern, message):
                return True
        return False


class ConfigurationError(Exception):
    """Configuration validation error."""
    pass
