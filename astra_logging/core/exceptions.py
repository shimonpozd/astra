"""Custom exceptions for Astra logging system."""


class AstraLoggingError(Exception):
    """Base exception for Astra logging system."""
    pass


class ConfigurationError(AstraLoggingError):
    """Configuration validation or loading error."""
    pass


class ParsingError(AstraLoggingError):
    """Log line parsing error."""
    pass


class BufferOverflowError(AstraLoggingError):
    """Buffer capacity exceeded."""
    pass


class OutputError(AstraLoggingError):
    """Output destination error (file, console, etc.)."""
    pass


class FilterError(AstraLoggingError):
    """Log filtering error."""
    pass


class ValidationError(AstraLoggingError):
    """Data validation error."""
    pass
