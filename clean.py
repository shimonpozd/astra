import asyncio
import redis.asyncio as redis

from brain_service.services.config_service import ConfigService

async def patch():
    redis_client = redis.from_url("redis://localhost:6379/0", decode_responses=True)
    config = ConfigService(redis_client)
    await config.start_listening()

    study = await config.get_config_section("study", default={}) or {}
    daily = study.setdefault("daily", {})
    daily.update(
        modular_loader_enabled=True,
        initial_small=60,
        initial_medium=60,
        initial_large=60,
        batch_size=10,
    )
    features = study.setdefault("features", {})
    features["facade_enabled"] = True

    await config.update_config_section("study", study)
    await config.stop_listening()
    await redis_client.close()
    print("Study config updated")

asyncio.run(patch())
