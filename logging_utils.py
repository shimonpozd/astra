import logging
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional
from logging.handlers import RotatingFileHandler

# Try to import Rich and JSON logger
try:
    from rich.logging import RichHandler
    from rich.console import Console
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    RichHandler = None

try:
    from pythonjsonlogger import jsonlogger
    JSON_AVAILABLE = True
except ImportError:
    JSON_AVAILABLE = False
    jsonlogger = None

def get_console_handler(level: str = logging.INFO) -> logging.Handler:
    """Get console handler with Rich formatting if available, else standard."""
    if RICH_AVAILABLE and sys.platform != "win32" or os.name != "nt":  # Rich works on Windows but colors may need colorama
        handler = RichHandler(
            console=Console(force_terminal=True),
            level=level,
            show_level=True,
            show_path=False,
            show_time=True,
            omit_repetition=True
        )
    else:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
    handler.setLevel(level)
    return handler

def get_json_handler(level: str = logging.INFO) -> Optional[logging.Handler]:
    """Get JSON formatter handler if available."""
    if not JSON_AVAILABLE:
        return None
    handler = logging.StreamHandler(sys.stdout)
    formatter = jsonlogger.JsonFormatter(
        fmt='%(asctime)s %(name)s %(levelname)s %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%S%z',
        static_fields={'service': 'unknown'}
    )
    handler.setFormatter(formatter)
    handler.setLevel(level)
    return handler

def get_file_handler(log_dir: str, service_name: str, level: str = logging.INFO) -> logging.Handler:
    """Get rotating file handler."""
    log_file = os.path.join(log_dir, f"{service_name}.log")
    os.makedirs(log_dir, exist_ok=True)
    handler = RotatingFileHandler(
        log_file, maxBytes=10*1024*1024, backupCount=5  # 10MB, 5 backups
    )
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    handler.setLevel(level)
    return handler

def get_logger(name: str, service: Optional[str] = None, module: Optional[str] = None, log_dir: str = "logs") -> logging.Logger:
    """Get configured logger with service/module extras."""
    logger = logging.getLogger(name)
    if logger.hasHandlers():
        logger.handlers.clear()  # Avoid duplicate handlers

    level = os.getenv("ASTRA_LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, level, logging.INFO)
    use_json = os.getenv("ASTRA_LOG_JSON", "0").lower() == "1"

    # Console handler
    console_handler = get_console_handler(log_level)

    # JSON if enabled
    json_handler = get_json_handler(log_level) if use_json else None

    # File handler
    file_handler = get_file_handler(log_dir, service or name.split('.')[0], log_level)

    logger.addHandler(console_handler)
    if json_handler:
        logger.addHandler(json_handler)
    logger.addHandler(file_handler)

    logger.setLevel(log_level)

    # Filter for modules if specified
    module_filter = os.getenv("ASTRA_LOG_MODULES", "")
    if module_filter and module and module not in module_filter.split(','):
        class ModuleFilter(logging.Filter):
            def filter(self, record):
                return False
        logger.addFilter(ModuleFilter())

    # Add extras processor
    class ExtrasProcessor(logging.Filter):
        def filter(self, record):
            if service:
                record.service = service
            if module:
                record.module = module
            return True
    logger.addFilter(ExtrasProcessor())

    # Suppress verbose logs from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)

    return logger