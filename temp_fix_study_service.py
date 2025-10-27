# Fix for line 489 in study_service.py
from config.personalities import get_personality

# Then change line 490 from:
# personality_config = get_personality_config(agent_id)
# To:
personality_config = get_personality(agent_id)





















