from dataclasses import dataclass
from typing import List

DEFAULT_CHUNK_SIZE = 280
DEFAULT_OVERLAP = 40

@dataclass
class Chunk:
    text: str
    index: int


def chunk_text(
    text: str,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> List[Chunk]:
    if not text:
        return []

    chunk_size = max(50, chunk_size)
    overlap = max(0, min(overlap, chunk_size // 2))

    tokens = text.split()
    if not tokens:
        return []

    chunks: List[Chunk] = []
    current_tokens: List[str] = []
    current_len = 0
    index = 0

    for token in tokens:
        token_len = len(token)
        separator = 1 if current_tokens else 0
        if current_len + token_len + separator > chunk_size and current_tokens:
            chunk_text_value = " ".join(current_tokens)
            chunks.append(Chunk(text=chunk_text_value, index=index))
            index += 1
            if overlap:
                current_tokens = _tail_tokens(current_tokens, overlap)
                current_len = len(" ".join(current_tokens))
            else:
                current_tokens = []
                current_len = 0
        if token_len > chunk_size:
            chunks.append(Chunk(text=token, index=index))
            index += 1
            current_tokens = []
            current_len = 0
            continue
        current_tokens.append(token)
        current_len += token_len + separator

    if current_tokens:
        chunks.append(Chunk(text=" ".join(current_tokens), index=index))

    return chunks


def _tail_tokens(tokens: List[str], overlap_chars: int) -> List[str]:
    if overlap_chars <= 0 or not tokens:
        return []
    reversed_tokens = []
    total_len = 0
    for token in reversed(tokens):
        tok_len = len(token)
        if reversed_tokens:
            tok_len += 1  # space
        if total_len + tok_len > overlap_chars and reversed_tokens:
            break
        reversed_tokens.append(token)
        total_len += tok_len
    return list(reversed(reversed_tokens))

