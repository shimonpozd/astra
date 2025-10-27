import sys, types, os
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
class CollectorRegistry:
    def __init__(self, *args, **kwargs):
        pass
Histogram = Counter = _Metric
stub.CollectorRegistry = CollectorRegistry
stub.Histogram = Histogram
stub.Counter = Counter
sys.modules.setdefault('prometheus_client', stub)

sys.path.append(os.path.abspath('brain_service'))
sys.path.append(os.path.abspath('.'))
import brain_service.services as services_pkg
sys.modules['services'] = services_pkg

from brain_service.services.study.config_schema import load_study_config, StudyConfig

cfg_obj = load_study_config(None)
print('cfg type module', type(cfg_obj), type(cfg_obj).__module__)
print('StudyConfig module', StudyConfig.__module__)
print('isinstance', isinstance(cfg_obj, StudyConfig))
