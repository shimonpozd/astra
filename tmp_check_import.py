import sys, os, importlib
sys.path.append(os.path.abspath('brain_service'))
sys.path.append(os.path.abspath('.'))
sys.modules['models'] = importlib.import_module('brain_service.models')
sys.modules['services'] = importlib.import_module('brain_service.services')
import brain_service.services.study_service as svc
print('ok')
