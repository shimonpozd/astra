import sys
import os

# Read startup.py
with open("brain_service/core/startup.py", "r", encoding="utf-8") as f:
    content = f.read()

# Find the position after sefaria_get_related_links registration
target = "    app.state.tool_registry.register(\n        name=\"sefaria_get_related_links\",\n        handler=app.state.sefaria_service.get_related_links,\n        schema=sefaria_get_related_links_schema\n    )"

lexicon_tool = """
    # Lexicon tool for word definitions
    sefaria_get_lexicon_schema = {
        \"type\": \"function\",
        \"function\": {
            \"name\": \"sefaria_get_lexicon\",
            \"description\": \"Get word definition and linguistic explanation from Sefaria lexicon. Use when user asks about meaning of Hebrew/Aramaic words.\",
            \"parameters\": {
                \"type\": \"object\",
                \"properties\": {
                    \"word\": {
                        \"type\": \"string\",
                        \"description\": \"Hebrew or Aramaic word to look up, e.g., \\\"שבת\\\" or \\\"תלמוד\\\"\"
                    }
                },
                \"required\": [\"word\"]
            }
        }
    }
    app.state.tool_registry.register(
        name=\"sefaria_get_lexicon\",
        handler=app.state.lexicon_service.get_word_definition,
        schema=sefaria_get_lexicon_schema
    )"""

# Replace the content
new_content = content.replace(target, target + lexicon_tool)

# Write back
with open("brain_service/core/startup.py", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Successfully added lexicon tool to startup.py")

