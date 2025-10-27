import sys
from pathlib import Path
text = Path('astra-web-client/src/components/study/StudyMode.tsx').read_text(encoding='utf-8')
needle = "onSegmentClick=(segment) => onNavigateToRef && onNavigateToRef(segment.ref)"
print('index', text.find(needle))
needle2 = "onSegmentClick={(segment) => onNavigateToRef && onNavigateToRef(segment.ref)}"
print('index2', text.find(needle2))
for part in [needle, needle2]:
    if part in text:
        idx = text.index(part)
        context = text[idx-10:idx+len(part)+10]
        sys.stdout.buffer.write(('context:' + context + '\n').encode('utf-8'))
