from typing import Any, Dict, List, Optional

def _build_research_context_message(
    plan: Optional[Dict[str, Any]],
    research_info: Optional[Dict[str, Any]],
) -> str:
    if not research_info:
        return ""

    lines: List[str] = []

    plan_focus = (plan or {}).get("focus") if isinstance(plan, dict) else None
    if isinstance(plan_focus, str) and plan_focus.strip():
        lines.append(f"Research focus: {plan_focus.strip()}")

    guiding = (plan or {}).get("guiding_questions") if isinstance(plan, dict) else None
    guiding_lines = [q.strip() for q in guiding or [] if isinstance(q, str) and q.strip()]
    if guiding_lines:
        lines.append("Guiding questions:")
        for idx, question in enumerate(guiding_lines, 1):
            lines.append(f"  {idx}. {question}")

    outline = (plan or {}).get("outline") if isinstance(plan, dict) else None
    outline_items = [item.strip() for item in outline or [] if isinstance(item, str) and item.strip()]
    if outline_items:
        lines.append("Outline for the drasha:")
        for idx, item in enumerate(outline_items, 1):
            lines.append(f"  {idx}. {item}")

    research_depth = research_info.get("research_depth") if isinstance(research_info, dict) else None
    if isinstance(research_depth, int) and research_depth > 0:
        lines.append(f"Research depth target: {research_depth} curated links")

    collection_name = research_info.get("collection") if isinstance(research_info, dict) else None
    if isinstance(collection_name, str) and collection_name.strip():
        lines.append(f"Research memory collection: {collection_name.strip()}")

    primary_summary = (research_info or {}).get("primary_summary") if isinstance(research_info, dict) else None
    if isinstance(primary_summary, list) and primary_summary:
        lines.append("Primary texts loaded:")
        for item in primary_summary[:4]:
            if not isinstance(item, dict):
                continue
            ref_label = item.get("ref") or item.get("original_ref")
            if not ref_label:
                continue
            chunk_info = item.get("chunks")
            truncated = item.get("truncated")
            suffix = f" (chunks: {chunk_info}{'+' if truncated else ''})" if chunk_info is not None else ""
            lines.append(f"  - {ref_label}{suffix}")

    supporting_summary = (research_info or {}).get("supporting_summary") if isinstance(research_info, dict) else None
    if isinstance(supporting_summary, list) and supporting_summary:
        lines.append("Supporting texts considered:")
        for item in supporting_summary[:3]:
            if not isinstance(item, dict):
                continue
            ref_label = item.get("ref") or item.get("original_ref")
            if not ref_label:
                continue
            chunk_info = item.get("chunks")
            truncated = item.get("truncated")
            suffix = f" (chunks: {chunk_info}{'+' if truncated else ''})" if chunk_info is not None else ""
            lines.append(f"  - {ref_label}{suffix}")

    commentary_summary = (research_info or {}).get("commentary_summary") if isinstance(research_info, dict) else None
    if isinstance(commentary_summary, dict) and commentary_summary:
        lines.append("Available commentaries:")
        for category, info in sorted(commentary_summary.items(), key=lambda item: item[0]):
            if not isinstance(info, dict):
                continue
            count = info.get("count")
            commentators = ", ".join(info.get("commentators", [])[:4])
            refs = ", ".join(info.get("refs", [])[:3])
            parts = []
            if count is not None:
                parts.append(f"{count}")
            if commentators:
                parts.append(f"commentators: {commentators}")
            if refs:
                parts.append(f"refs: {refs}")
            details = ", ".join(parts)
            lines.append(f"  - {category}: {details}" if details else f"  - {category}")

    preview = (research_info or {}).get("memory_preview") if isinstance(research_info, dict) else None
    preview_groups = []
    if isinstance(preview, dict):
        preview_groups = preview.get("groups") or []
    if preview_groups:
        lines.append("Stored research snippets:")
        for group in preview_groups[:5]:
            if not isinstance(group, dict):
                continue
            ref_label = group.get("ref") or group.get("origin_ref") or "unknown ref"
            commentator = group.get("commentator")
            role_label = group.get("role")
            parts = [ref_label]
            if commentator:
                parts.append(f"({commentator})")
            if role_label:
                parts.append(f"[{role_label}]")
            lines.append(f"  - {' '.join(parts)}")
            sample_chunks = group.get("chunks") or []
            if sample_chunks:
                sample_text = sample_chunks[0].get("text", "") if isinstance(sample_chunks[0], dict) else ""
                if sample_text:
                    snippet = sample_text[:160]
                    if len(sample_text) > 160:
                        snippet += "…"
                    lines.append(f"    sample: {snippet}")

    def _format_ref_entry(entry: Dict[str, Any]) -> str:
        ref = entry.get("ref") or entry.get("original_ref")
        categories = entry.get("categories") or entry.get("category")
        category_part = ""
        if isinstance(categories, list):
            cat_values = [c for c in categories if isinstance(c, str) and c]
            if cat_values:
                category_part = f" (categories: {', '.join(cat_values)})"
        elif isinstance(categories, str) and categories:
            category_part = f" (category: {categories})"
        return f"- {ref}{category_part}" if ref else ""

    sources = research_info.get("sources") if isinstance(research_info, dict) else None
    if isinstance(sources, list) and sources:
        primary_lines: List[str] = []
        supporting_lines: List[str] = []
        for item in sources:
            if not isinstance(item, dict):
                continue
            formatted = _format_ref_entry({"ref": item.get("ref"), "categories": item.get("categories", [])})
            if not formatted:
                continue
            role = item.get("role") or "supporting"
            if role == "primary":
                primary_lines.append(formatted)
            else:
                supporting_lines.append(formatted)
        if primary_lines:
            lines.append("Primary texts:")
            lines.extend(f"  {entry}" for entry in primary_lines)
        if supporting_lines:
            lines.append("Supporting texts:")
            lines.extend(f"  {entry}" for entry in supporting_lines)

        commentary_lines: List[str] = []
        total_commentaries = 0
        for item in sources:
            if not isinstance(item, dict):
                continue
            for commentary in item.get("commentaries", []) or []:
                if not isinstance(commentary, dict):
                    continue
                ref = commentary.get("ref")
                commentator = commentary.get("commentator")
                category = commentary.get("category")
                if not ref or not commentator:
                    continue
                total_commentaries += 1
                category_part = f" [{category}]" if category else ""
                commentary_lines.append(f"  - {commentator}{category_part}: {ref}")
        if commentary_lines:
            max_lines = min(len(commentary_lines), 40)
            lines.append(f"Selected commentaries ({total_commentaries} total, showing {max_lines}):")
            lines.extend(commentary_lines[:max_lines])

    external_sources = (plan or {}).get("external_sources") if isinstance(plan, dict) else None
    external_lines = [src.strip() for src in external_sources or [] if isinstance(src, str) and src.strip()]
    if external_lines:
        lines.append("External references to consult:")
        lines.extend(f"  - {src}" for src in external_lines)

    external_references = (research_info or {}).get("external_references") if isinstance(research_info, dict) else None
    if isinstance(external_references, list) and external_references:
        lines.append("\n--- Справка (внешние источники) ---")
        for ref in external_references:
            source_name = ref.get("source", "Unknown Source")
            data = ref.get("data", {})
            title = data.get("title", "")
            summary = data.get("summary", "")
            url = data.get("url", "")
            lines.append(f"- Источник: {source_name}")
            lines.append(f"  - Заголовок: {title}")
            lines.append(f"  - URL: {url}")
            lines.append(f"  - Краткое содержание: {summary}")

    if lines:
        lines.append("Use the outline and cited sources above to craft the drasha, provide direct citations for each primary and commentary reference, and compare viewpoints when relevant.")

    notes = (research_info or {}).get("notes") if isinstance(research_info, dict) else None
    if isinstance(notes, list) and notes:
        lines.append("Research notes prepared (use them as distilled reasoning):")
        for idx, note_chunk in enumerate(notes[:8], 1): # Increased to 8 for more context
            if not isinstance(note_chunk, dict):
                continue

            summary = ""
            note_text = note_chunk.get("text", "")
            try:
                note_data = json.loads(note_text)
                if not isinstance(note_data, dict):
                    raise TypeError("Note is not a dictionary")

                # New structured format
                note_type = note_data.get("type", "Note")
                point = note_data.get("point", "")
                ref = note_data.get("ref", "unknown")
                
                summary = f"[{note_type}] on {ref}: {point}"

            except (json.JSONDecodeError, TypeError):
                # Fallback for old format or malformed JSON
                metadata = note_chunk.get("metadata", {})
                label = metadata.get("source_ref") or "unknown"
                role = metadata.get("note_type") or "note"
                raw_summary = note_chunk.get("summary") or note_text
                raw_summary = raw_summary.replace("\n", " ")
                if len(raw_summary) > 160:
                    raw_summary = raw_summary[:157].rstrip() + "…"
                summary = f"{role}: {label} — {raw_summary}"

            if summary:
                lines.append(f"  {idx}. {summary}")

    note_collection = (research_info or {}).get("note_collection") if isinstance(research_info, dict) else None
    if isinstance(note_collection, str) and note_collection.strip():
        lines.append(f"Note summaries stored in collection: {note_collection.strip()}")

    internal_questions = (research_info or {}).get("internal_questions") if isinstance(research_info, dict) else None
    if isinstance(internal_questions, list) and internal_questions:
        lines.append("\n--- INTERNAL GUIDING QUESTIONS ---")
        lines.append("Based on the initial analysis, focus on answering these questions in the next steps:")
        for idx, question in enumerate(internal_questions, 1):
            lines.append(f"  {idx}. {question}")

    critic_feedback = (research_info or {}).get("critic_feedback") if isinstance(research_info, dict) else None
    if isinstance(critic_feedback, list) and critic_feedback:
        lines.append("\n--- CRITIC'S FEEDBACK ---")
        lines.append("The following points were raised by a critic reviewing the draft. Address them in your final answer:")
        for idx, feedback in enumerate(critic_feedback, 1):
            lines.append(f"  {idx}. {feedback}")

    if isinstance(research_info, dict):
        draft_text = research_info.get("draft")
        if isinstance(draft_text, str) and draft_text.strip():
            lines.append("A preliminary draft has been prepared based on the research notes. Your task is to refine, expand, and polish this draft into a final, high-quality text, using all the provided context (plan, notes, etc.).")
            lines.append("\n--- PRELIMINARY DRAFT ---\n")
            lines.append(draft_text)
            lines.append("\n--- END OF DRAFT ---\n")

    return "\n".join(lines).strip()
