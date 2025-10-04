def compact_text_v3(resp: dict) -> dict:
    v = (resp.get("versions") or [{}])[0]
    # текст может прийти строкой или списком сегментов (редко). Приведём к строке.
    raw_text = v.get("text", "")
    if isinstance(raw_text, list):
        raw_text = "\n".join([t for t in raw_text if isinstance(t, str)])

    # лёгкая зачистка: убираем лишние пробелы, ограничим длину экрана, если нужно
    text = " ".join(raw_text.split())

    compact = {
        "ref": resp.get("ref"),
        "heRef": resp.get("heRef"),
        "sectionRef": resp.get("sectionRef"),
        "heSectionRef": resp.get("heSectionRef"),
        "next": resp.get("next"),
        "prev": resp.get("prev"),
        "text": text,
        "versionTitle": v.get("versionTitle"),
        "language": v.get("actualLanguage") or v.get("language"),
        "direction": v.get("direction"),
    }
    # ПОМНИ: ничего лишнего не возвращаем
    return {"ok": True, "data": compact}


def clamp_lines(s: str, max_lines: int = 8) -> str:
    lines = s.splitlines()
    cut = "\n".join(lines[:max_lines]).strip()
    return cut