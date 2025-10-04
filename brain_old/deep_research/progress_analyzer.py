#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Analyzes the progress of a research task and provides guidance for the LLM.
КРИТИЧНОЕ ИСПРАВЛЕНИЕ: Система теперь РЕШАЕТ вопросы, а не штрафуется за них.
"""

import logging
from typing import Any, Dict, List, Tuple

from config.prompts import get_prompt

logger = logging.getLogger(__name__)

class ResearchCompletenessChecker:
    """
    Checks the completeness of the research and generates specific recommendations.
    КРИТИЧНО ИСПРАВЛЕНО: Теперь правильно оценивает готовность к завершению.
    """
    
    def check_completeness(self, research_info: Dict[str, Any], iteration_count: int, max_iterations: int) -> Dict[str, Any]:
        """Comprehensive check of research completeness."""
        score = self._calculate_completion_score(research_info)
        missing_aspects = self._identify_missing_aspects(research_info)
        should_continue, reason = self._should_continue_research(score, iteration_count, max_iterations, missing_aspects)
        
        return {
            "overall_score": score,
            "missing_aspects": missing_aspects,
            "should_continue": should_continue,
            "reason": reason,
            "recommendations": self._generate_recommendations(missing_aspects, research_info)
        }

    def _calculate_completion_score(self, research_info: Dict[str, Any]) -> float:
        """
        КРИТИЧНО ИСПРАВЛЕНО: Правильная логика оценки полноты исследования.
        Высокий балл = готовность к финальному синтезу.
        """
        if not research_info:
            return 0.0
        
        score = 0.0
        
        # Базовые элементы (обязательные для любого исследования)
        if any(s.get("role") == "primary" for s in research_info.get("sources", [])):
            score += 0.25  # Есть первичный источник
            
        if len(research_info.get("commentaries", [])) >= 1:
            score += 0.2   # Есть хотя бы один комментарий
            
        if research_info.get("draft"):
            score += 0.2   # Есть черновик
            
        # Покрытие категорий источников
        essential_cats = {"Commentary", "Talmud", "Halakhah", "Midrash"}
        covered_cats = set(research_info.get("commentary_summary", {}).keys())
        if essential_cats:
            coverage_ratio = len(covered_cats.intersection(essential_cats)) / len(essential_cats)
            score += coverage_ratio * 0.15
        
        # ИСПРАВЛЕННАЯ ЛОГИКА: Награждаем за ОТСУТСТВИЕ нерешенных вопросов/критики
        # Это означает, что система решила поставленные задачи
        has_unresolved_questions = bool(research_info.get("internal_questions"))
        has_unresolved_feedback = bool(research_info.get("critic_feedback"))
        
        if not has_unresolved_questions:
            score += 0.1  # Бонус за отсутствие нерешенных вопросов
        if not has_unresolved_feedback:
            score += 0.1  # Бонус за отсутствие нерешенной критики
            
        # Дополнительные бонусы за качество
        if len(research_info.get("notes", [])) >= 3:
            score += 0.05  # Есть достаточно заметок
        if research_info.get("chunks_stored", 0) > 0:
            score += 0.05  # Данные успешно сохранены
            
        return min(score, 1.0)

    def _identify_missing_aspects(self, research_info: Dict[str, Any]) -> List[str]:
        """Определяет что еще нужно сделать для завершения исследования."""
        missing = []
        
        if not research_info:
            return ["initial data collection"]
            
        # Проверяем основные элементы
        if not research_info.get("draft"):
            missing.append("draft generation")
            
        if not any(s.get("role") == "primary" for s in research_info.get("sources", [])):
            missing.append("primary source analysis")
            
        # Проверяем покрытие важных категорий
        essential_cats = {"Commentary", "Halakhah"}  # Минимальный набор
        covered_cats = set(research_info.get("commentary_summary", {}).keys())
        missing_cats = essential_cats - covered_cats
        
        for cat in missing_cats:
            missing.append(f"sources from '{cat}' category")
            
        # ИСПРАВЛЕНО: Активные задачи (вопросы/критика) считаются незавершенными
        if research_info.get("internal_questions"):
            missing.append("resolution of internal questions")
        if research_info.get("critic_feedback"):
            missing.append("addressing critic's feedback")
            
        return missing

    def _should_continue_research(self, score: float, iteration_count: int, max_iterations: int, missing_aspects: List[str]) -> Tuple[bool, str]:
        """
        ИСПРАВЛЕНО: Более разумная логика принятия решений о продолжении.
        """
        # Жесткие ограничения
        if iteration_count >= max_iterations:
            return False, "Maximum iterations reached"
            
        # Если исследование только началось, продолжаем
        if iteration_count <= 2:
            return True, "Research is in early stages"
            
        # Если есть критичные недостатки, продолжаем (но не бесконечно)
        critical_missing = [a for a in missing_aspects if any(k in a for k in ["draft", "primary", "questions", "feedback"])]
        if critical_missing and iteration_count < 6:
            return True, f"Critical aspects missing: {critical_missing[0]}"
            
        # Если оценка высокая, можно завершать
        if score >= 0.8:
            return False, "Research quality is sufficient for completion"
            
        # Если оценка приемлемая, но итераций достаточно, завершаем
        if score >= 0.6 and iteration_count >= 3:
            return False, "Acceptable quality reached with sufficient iterations"
            
        # В остальных случаях продолжаем, если не слишком много итераций
        if iteration_count < 5:
            return True, f"Quality score ({score:.1%}) can be improved"
            
        return False, "Maximum reasonable effort expended"

    def _generate_recommendations(self, missing_aspects: List[str], research_info: Dict[str, Any]) -> List[str]:
        """Генерирует конкретные рекомендации для следующего шага."""
        recommendations = []
        
        if not missing_aspects:
            recommendations.append("Research appears complete - proceed to final synthesis.")
            return recommendations
            
        # Приоритизируем рекомендации
        if any("draft" in a for a in missing_aspects):
            recommendations.append("Generate a preliminary draft based on available sources.")
        elif any("primary" in a for a in missing_aspects):
            recommendations.append("Analyze the primary source text more thoroughly.")
        elif any("sources from" in a for a in missing_aspects):
            missing_categories = [a.split("'")[1] for a in missing_aspects if "sources from" in a]
            recommendations.append(f"Find additional sources from: {', '.join(missing_categories[:2])}")
        elif any("questions" in a for a in missing_aspects):
            recommendations.append("Address the internal research questions that were raised.")
        elif any("feedback" in a for a in missing_aspects):
            recommendations.append("Revise the draft based on the critic's feedback.")
        else:
            recommendations.append("Enhance the analysis with deeper insights or practical applications.")
            
        return recommendations[:3]  # Максимум 3 рекомендации

def build_enhanced_system_prompt(research_info: Dict[str, Any], iteration_count: int) -> str:
    return get_prompt("progress_analyzer.base") or ""

def create_continuation_prompt(completeness_check: Dict[str, Any]) -> str:
    if not completeness_check.get("should_continue"):
        return ""
        
    score = completeness_check.get("overall_score", 0)
    recommendations = completeness_check.get("recommendations", [])
    
    prompt_parts = [
        f"<think>Research completeness: {score:.1%}. Next actions needed:</think>",
        "Research is not yet complete. Focus on:"
    ]
    
    for rec in recommendations:
        prompt_parts.append(f"- {rec}")
        
    prompt_parts.append("Use available tools to address these points.")
    return "\n".join(prompt_parts)