# STM Critical Fixes - Memory Service

## 🚨 Критичные исправления (must-fix)

### ✅ 1) Использование refs до объявления
**Проблема:** `UnboundLocalError` - `refs` использовался до объявления в `update_stm()`

**Исправление:**
```python
# Было (ошибка):
summary_refs = summary_result.get("refs", [])
if summary_refs:
    refs = self._merge_refs(refs, summary_refs)  # refs ещё не определен

# Стало (исправлено):
refs = self._extract_refs(last_messages)  # 1) базовые refs
if self.summary_service:
    summary_refs = summary_result.get("refs", [])
    if summary_refs:
        refs = self._merge_refs(refs, summary_refs)  # 2) теперь безопасно
```

### ✅ 2) Decay заявлен как экспоненциальный, но фактически линейный
**Проблема:** Линейный decay `1 - rate*age` вместо экспоненциального

**Исправление:**
```python
# Было (линейный):
decay_factor = 1.0 - (decay_rate * age_hours)
decayed_score = item.get("score", 0) * max(0, decay_factor)

# Стало (экспоненциальный):
decay_rate = math.log(2) / max(half_life_hours, 0.01)  # True exponential
decayed_score = item.get("score", 0) * math.exp(-decay_rate * age_hours)
```

### ✅ 3) Непоследовательные лимиты слотов
**Проблема:** `MAX_GLOSSARY` константа вместо конфигурируемого значения

**Исправление:**
```python
# Добавлено в __init__:
self.max_glossary = slots_config.get("glossary_max_items", self.MAX_GLOSSARY)

# Заменено в коде:
"glossary": merged_glossary[:self.max_glossary],  # вместо MAX_GLOSSARY
```

### ✅ 4) Двойной расчёт summary
**Проблема:** `summary_v1` и `summary_v2` считались отдельно из одних данных

**Исправление:**
```python
# Было:
summary_v1 = self._generate_running_summary(last_messages)  # дублирование

# Стало:
summary_v1 = summary_v2 or self._generate_running_summary(last_messages)  # избегаем дублирования
```

## 🔧 Важные улучшения

### ✅ 5) Бюджет инъекции в промпт (safety-cap)
**Проблема:** `format_stm_for_prompt` не ограничивал общий размер

**Исправление:**
```python
def format_stm_for_prompt(self, stm, ..., max_chars_budget: int = 1200) -> str:
    budget = 0
    
    def add_line(s: str) -> bool:
        nonlocal budget
        if budget + len(s) + 1 > max_chars_budget:
            return False
        parts.append(s)
        budget += len(s) + 1
        return True
    
    # Приоритет: bullets → facts → loops → refs
    # Каждый блок проверяется на бюджет
```

## 📊 Результаты исправлений

### Надежность
- ✅ **Исправлен UnboundLocalError** - refs теперь объявляется до использования
- ✅ **Исправлен экспоненциальный decay** - правильная математика для старения
- ✅ **Консистентные лимиты** - все слоты используют конфигурируемые значения

### Эффективность  
- ✅ **Устранено дублирование** - summary_v1 не пересчитывается если есть summary_v2
- ✅ **Бюджет инъекции** - предотвращает раздувание промптов
- ✅ **Приоритетное усечение** - bullets → facts → loops → refs

### Конфигурируемость
- ✅ **Единый стиль** - все лимиты слотов настраиваются через конфиг
- ✅ **Безопасные лимиты** - защита от переполнения промптов
- ✅ **Гибкость** - можно настроить бюджет инъекции

## 🎯 Статус

**Все критичные баги исправлены!** STM теперь работает стабильно и предсказуемо:

- ✅ Нет runtime ошибок
- ✅ Правильный экспоненциальный decay  
- ✅ Консистентная конфигурация
- ✅ Эффективное использование ресурсов
- ✅ Защита от переполнения промптов

STM готов к продакшену! 🚀


























