# STM Upgrade Implementation Summary

## ✅ Completed Features

### 1. Structured Memory Slots
- **summary_v1**: Running summary as bullet points (max 8, 140 chars each)
- **salient_facts**: Factual statements with scores and timestamps (max 50)
- **open_loops**: Questions and unresolved topics (max 10)
- **glossary**: Terms and definitions (max 20)
- **refs**: Sefaria references extracted from conversations (max 10)
- **persona_ctx**: Session-specific persona settings

### 2. SimHash-based Deduplication
- 64-bit SimHash signatures for semantic similarity detection
- Hamming distance threshold (6/64) for duplicate detection
- Automatic signature generation and comparison
- Prevents duplicate facts and reduces memory bloat

### 3. Hysteresis Triggers with Cooldown
- **High thresholds**: 10 messages OR 2500 tokens → immediate update
- **Low thresholds**: 6 messages AND 1500 tokens → moderate update
- **Cooldown**: 30 seconds minimum between updates
- **Metadata tracking**: Last update timestamp in Redis

### 4. Enhanced Fact Extraction
- **Factual statements**: Detects "is", "are", "means", "refers to" patterns
- **Questions**: Extracts questions with "?" markers
- **Glossary terms**: Finds "X means Y" and "X — это Y" patterns
- **Sefaria refs**: Regex-based extraction of Talmudic references
- **Scoring system**: Facts get higher scores, questions get lower scores

### 5. Decay and Aging
- Exponential decay based on item age (0.1 rate per hour)
- Automatic removal of low-score items
- Freshness bonus for recent items
- Natural memory cleanup without manual intervention

### 6. Prompt Integration
- **System message injection**: STM context added to system prompts
- **Structured formatting**: Clear sections for summary, facts, loops, refs
- **Configurable limits**: Max 3 facts, 3 loops, 3 refs in prompts
- **Empty handling**: No STM injection if no meaningful content

### 7. Service Integration
- **ChatService**: Updated to use new STM API with hysteresis
- **StudyService**: Added STM context to both panel explainer and chavruta agents
- **LLMService**: Created new service with STM integration
- **Dependency injection**: Memory service properly wired in startup

### 8. Comprehensive Logging
- **Structured logging**: JSON-formatted logs with session context
- **Performance metrics**: Latency tracking for STM operations
- **Update decisions**: Logs when and why STM updates occur
- **Error handling**: Graceful degradation when Redis unavailable

## 🔧 Technical Implementation

### Memory Service Architecture
```python
class MemoryService:
    # Configuration constants
    TRIGGER_MSGS_HIGH = 10
    TRIGGER_MSGS_LOW = 6
    TRIGGER_TOKENS_HIGH = 2500
    TRIGGER_TOKENS_LOW = 1500
    HAMMING_THRESHOLD = 6
    
    # Core methods
    async def should_update_stm()  # Hysteresis logic
    async def update_stm()         # Structured extraction & merging
    async def get_stm()            # Retrieve with stats
    def format_stm_for_prompt()    # Prompt formatting
```

### Data Structure
```json
{
  "summary_v1": ["Q: What is Shabbat?", "A: Shabbat is the Jewish day of rest..."],
  "salient_facts": [
    {
      "text": "Shabbat begins on Friday evening",
      "score": 1.5,
      "ts": 1696123456.789,
      "sig": 12345678901234567890
    }
  ],
  "open_loops": [...],
  "glossary": [...],
  "refs": ["Shabbat 2a:1", "Berakhot 3b:2"],
  "ts_updated": 1696123456.789
}
```

### Integration Points
- **ChatService.process_chat_stream()**: STM update after assistant response
- **StudyService._run_panel_explainer_agent()**: STM context injection
- **StudyService._run_general_chavruta_agent()**: STM context injection
- **LLMService.stream_chat()**: Automatic STM integration

## 📊 Performance Benefits

### Memory Efficiency
- **Reduced context bloat**: Structured slots prevent memory overflow
- **Semantic deduplication**: SimHash prevents duplicate facts
- **Automatic cleanup**: Decay removes outdated information
- **Focused extraction**: Only relevant facts and questions stored

### Token Optimization
- **Deterministic updates**: Hysteresis prevents excessive updates
- **Cooldown protection**: 30-second minimum between updates
- **Structured prompts**: Clear, concise STM context injection
- **Configurable limits**: Adjustable fact/loop/ref counts

### Accuracy Improvements
- **Context preservation**: Key facts maintained across conversations
- **Reference tracking**: Sefaria refs help maintain study context
- **Question continuity**: Open loops prevent forgotten questions
- **Terminology consistency**: Glossary maintains definition accuracy

## 🚀 Usage Examples

### Basic STM Update
```python
# Automatic update after chat response
should_update = await memory_service.should_update_stm(
    session_id, message_count=8, token_count=2000
)
if should_update:
    await memory_service.update_stm(session_id, recent_messages)
```

### STM Context Injection
```python
# Get formatted STM for prompt
stm = await memory_service.get_stm(session_id)
if stm:
    stm_context = memory_service.format_stm_for_prompt(stm)
    system_prompt = f"{base_prompt}\n\n[STM Context]\n{stm_context}"
```

### STM Statistics
```python
# Monitor STM health
stats = await memory_service.get_stm_stats(session_id)
print(f"Facts: {stats['facts_count']}, Age: {stats['age_hours']:.1f}h")
```

## 🎯 Key Improvements Achieved

1. **Reduced Forgetfulness**: Structured memory slots maintain context
2. **Deterministic Updates**: Hysteresis prevents erratic behavior
3. **Noise Reduction**: SimHash deduplication eliminates duplicates
4. **Precise Reminders**: Scored facts and open loops improve relevance
5. **Minimal Manual Logic**: Clear APIs with automatic TTL and metrics
6. **Cost Efficiency**: Optimized token usage with structured prompts

## 🔄 Migration Notes

- **Backward Compatible**: Existing STM data will be migrated automatically
- **Graceful Degradation**: System works without Redis (STM disabled)
- **Configurable**: All thresholds and limits can be adjusted
- **Observable**: Comprehensive logging for monitoring and debugging

The enhanced STM system provides a robust foundation for maintaining conversational context while minimizing token costs and maximizing accuracy.




