import logging
import json
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from core.dependencies import get_http_client, get_lexicon_service, get_translation_service
from models.actions_models import TranslateRequest, ExplainTermRequest

# Assuming these functions will be moved to a service layer later
from config.prompts import get_prompt
from core.llm_config import get_llm_for_task, LLMConfigError

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/translate")
async def translate_handler(
    request: TranslateRequest, 
    translation_service = Depends(get_translation_service)
):
    """Translate a text reference using TranslationService."""
    
    async def serialize_to_ndjson():
        async for chunk in translation_service.translate_text_reference(request.tref):
            yield json.dumps(chunk, ensure_ascii=False) + '\n'
    
    return StreamingResponse(
        serialize_to_ndjson(),
        media_type="application/x-ndjson"
    )



@router.post("/explain-term")
async def explain_term_handler(
    request: ExplainTermRequest, 
    lexicon_service = Depends(get_lexicon_service)
):
    logger.info(f"Received term explanation request for: {request.term}")

    # Get definition from lexicon service
    lexicon_result = await lexicon_service.get_word_definition(request.term)
    
    if lexicon_result.get("ok"):
        sefaria_data = lexicon_result["data"]
    else:
        sefaria_data = {"error": lexicon_result.get("error", "Unknown error")}

    try:
        llm_client, model, reasoning_params, _ = get_llm_for_task("LEXICON")
    except LLMConfigError as e:
        raise HTTPException(status_code=500, detail=f"LLM not configured: {e}")

    system_prompt = get_prompt("actions.lexicon_system")
    user_prompt_template = get_prompt("actions.lexicon_user_template")

    if not system_prompt or not user_prompt_template:
        raise HTTPException(status_code=500, detail="Lexicon prompts not configured.")

    user_prompt = user_prompt_template.replace("{term}", request.term)
    user_prompt = user_prompt.replace("{context_text}", request.context_text)
    user_prompt = user_prompt.replace("{sefaria_data}", json.dumps(sefaria_data, indent=2, ensure_ascii=False))

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    async def stream_llm_response():
        try:
            stream = await llm_client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                **reasoning_params
            )
            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            logger.error(f"LEXICON_STREAM: Error during stream: {e}", exc_info=True)
            yield json.dumps({"type": "error", "data": {"message": "Error from LLM."}})

    return StreamingResponse(stream_llm_response(), media_type="text/event-stream")
