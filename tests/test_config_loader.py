import os
import importlib

import pytest

from config import load_config, reload_config, flatten_to_env, CONFIG_ENV_PREFIX


def _clear_env(prefix: str):
    to_delete = [key for key in os.environ if key.startswith(prefix)]
    for key in to_delete:
        del os.environ[key]


@pytest.fixture(autouse=True)
def reset_config_env():
    original_env = os.environ.copy()
    try:
        yield
    finally:
        _clear_env(CONFIG_ENV_PREFIX)
        os.environ.clear()
        os.environ.update(original_env)
        reload_config()


def test_load_config_includes_defaults():
    reload_config()
    config = load_config()
    assert config['llm']['provider'] == 'openrouter'
    assert config['services']['memory_service_url'] == 'http://localhost:7050'


def test_env_override_via_prefix():
    os.environ[f'{CONFIG_ENV_PREFIX}LLM__PROVIDER'] = 'custom-provider'
    reload_config()
    config = load_config()
    assert config['llm']['provider'] == 'custom-provider'


def test_flatten_to_env_round_trip():
    sample = {
        'llm': {
            'provider': 'openrouter',
            'parameters': {
                'temperature': 0.3,
            },
        },
        'services': {
            'memory_service_url': 'http://localhost:7050',
        },
    }
    flattened = flatten_to_env(sample)
    assert flattened['LLM__PROVIDER'] == 'openrouter'
    assert flattened['LLM__PARAMETERS__TEMPERATURE'] == '0.3'
    assert flattened['SERVICES__MEMORY_SERVICE_URL'] == 'http://localhost:7050'
