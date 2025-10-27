import sys, types, os, asyncio, httpx

# stub prometheus_client before other imports
stub = types.ModuleType('prometheus_client')
class _Metric:
    def __init__(self, *args, **kwargs):
        pass
    def observe(self, value):
        pass
    def labels(self, **kwargs):
        return self
    def inc(self, amount=1):
        pass
class CollectorRegistry:  # noqa: N801
    def __init__(self, *args, **kwargs):
        pass
Histogram = Counter = _Metric
stub.CollectorRegistry = CollectorRegistry
stub.Histogram = Histogram
stub.Counter = Counter
sys.modules.setdefault('prometheus_client', stub)

sys.path.append(os.path.abspath('brain_service'))
sys.path.append(os.path.abspath('.'))
# ensure services package alias for relative imports
import brain_service.services as services_pkg
sys.modules['services'] = services_pkg

from brain_service.services.sefaria_service import SefariaService
from brain_service.services.sefaria_index_service import SefariaIndexService
from brain_service.services.study_service import StudyService
from config import get_config_section

class DummyToolRegistry:
    def get_tool_schemas(self):
        return []
    async def call(self, *args, **kwargs):
        raise NotImplementedError

class DummyRedis:
    async def get(self, *args, **kwargs):
        return None
    async def set(self, *args, **kwargs):
        return True
    async def delete(self, *args, **kwargs):
        return True
    async def exists(self, *args, **kwargs):
        return False
    async def pipeline(self):
        class _Pipeline:
            async def execute(self_inner):
                return []
            def __getattr__(self_inner, item):
                async def _noop(*args, **kwargs):
                    return True
                return _noop
        return _Pipeline()

async def main():
    cfg = get_config_section('services.brain.sefaria', {}) or {}
    async with httpx.AsyncClient(timeout=20.0) as client:
        index = SefariaIndexService(client, cfg.get('api_url', 'https://www.sefaria.org/api/'), cfg.get('api_key'))
        await index.load()
        sefaria = SefariaService(client, None, cfg.get('api_url', 'https://www.sefaria.org/api/'), cfg.get('api_key'), cache_ttl_sec=60)
        study_service = StudyService(
            redis_client=DummyRedis(),
            sefaria_service=sefaria,
            sefaria_index_service=index,
            tool_registry=DummyToolRegistry(),
            memory_service=None,
            study_config=None,
        )
        from brain_service.models.study_models import StudySetFocusRequest
        req = StudySetFocusRequest(session_id='test', ref='Exodus 8:1', window_size=10, navigation_type='drill_down')
        resp = await study_service.set_focus(req)
        state = resp.state
        print('segments', len(state.segments))
        print([seg.ref for seg in state.segments[:10]])
        print('focusIndex', state.focusIndex)

asyncio.run(main())
