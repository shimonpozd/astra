import sys
from pathlib import Path
path = Path("astra-web-client/src/components/study/StudyMode.tsx")
text = path.read_text(encoding="utf-8")
needle = "if (onNavigateToSegmentLocal && studySnapshot?.segments && studySnapshot.segments.some(seg => seg.ref === segment.ref)) {"
print('index', text.find(needle))
