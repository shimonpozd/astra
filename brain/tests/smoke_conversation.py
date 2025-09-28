import os
import sys

# Ensure we can import the local main.py
sys.path.insert(0, ".")

import types


# Provide lightweight stubs for optional heavy deps absent in test env
def _install_stubs():
    # openai
    if "openai" not in sys.modules:
        class _DummyOpenAI:
            def __init__(self, *a, **k):
                pass
        m = types.ModuleType("openai")
        m.OpenAI = _DummyOpenAI
        sys.modules["openai"] = m

    # fastapi
    if "fastapi" not in sys.modules:
        class _HTTPException(Exception):
            def __init__(self, status_code=500, detail=""):
                super().__init__(detail)
                self.status_code = status_code
                self.detail = detail

        class _BackgroundTasks:
            def __init__(self):
                self.tasks = []
            def add_task(self, fn, *args, **kwargs):
                self.tasks.append((fn, args, kwargs))

        class _App:
            def __init__(self, *a, **k):
                pass
            def on_event(self, name):
                def deco(fn):
                    return fn
                return deco

        m = types.ModuleType("fastapi")
        m.FastAPI = _App
        m.BackgroundTasks = _BackgroundTasks
        m.HTTPException = _HTTPException
        sys.modules["fastapi"] = m

    # dotenv
    if "dotenv" not in sys.modules:
        m = types.ModuleType("dotenv")
        def load_dotenv(*a, **k):
            return None
        m.load_dotenv = load_dotenv
        sys.modules["dotenv"] = m

    # pydantic
    if "pydantic" not in sys.modules:
        m = types.ModuleType("pydantic")
        class BaseModel:  # minimal stub
            def __init__(self, **data):
                for k, v in data.items():
                    setattr(self, k, v)
            def model_dump(self):
                return self.__dict__
        def Field(default_factory=None, default=None):
            return default if default is not None else (default_factory() if default_factory else None)
        m.BaseModel = BaseModel
        m.Field = Field
        sys.modules["pydantic"] = m

    # uvicorn
    if "uvicorn" not in sys.modules:
        m = types.ModuleType("uvicorn")
        def run(*a, **k):
            return None
        m.run = run
        sys.modules["uvicorn"] = m


_install_stubs()

import main  # type: ignore


class DummyBG:
    def __init__(self):
        self.calls = []

    def add_task(self, fn, *args, **kwargs):
        self.calls.append((fn.__name__, args, kwargs))


class FakeMemoryResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {"memories": []}
        self.text = "ok"

    def json(self):
        return self._payload


class FakeRequests:
    def __init__(self):
        self.posts = []
        self.gets = []

    def post(self, url, json=None, timeout=None):
        self.posts.append((url, json, timeout))
        # Return empty recall and accept condense/tts
        if url.endswith("/memory/recall"):
            return FakeMemoryResponse(200, {"memories": []})
        return FakeMemoryResponse(200, {})

    def get(self, url, timeout=None):
        self.gets.append((url, timeout))
        return FakeMemoryResponse(200, {"ok": True})


class FakeChatCompletions:
    def __init__(self, scripted_replies):
        self.scripted = scripted_replies
        self.i = 0

    def create(self, model, messages, temperature=0.0):
        # Use next scripted reply
        idx = min(self.i, len(self.scripted) - 1)
        content = self.scripted[idx]
        self.i += 1

        class Msg:
            def __init__(self, content):
                self.content = content

        class Choice:
            def __init__(self, content):
                self.message = Msg(content)

        class Resp:
            def __init__(self, content):
                self.choices = [Choice(content)]

        return Resp(content)


class FakeOpenAI:
    def __init__(self, replies):
        class Chat:
            def __init__(self, replies):
                self.completions = FakeChatCompletions(replies)

        self.chat = Chat(replies)


class Req:
    def __init__(self, user_id, text, agent_id=None):
        self.user_id = user_id
        self.text = text
        self.agent_id = agent_id


def run():
    # Scripted model replies with hidden STATE blocks
    replies = [
        (
            "Привет! Запомнил, что вас зовут Алексей.\n\n"
            "### STATE\n" 
            "```json\n"
            "{\n"
            "  \"summary\": \"Пользователь представился Алексеем; начало знакомства.\",\n"
            "  \"focus\": \"узнаём базовые предпочтения пользователя\",\n"
            "  \"entities\": [\"Алексей\"],\n"
            "  \"todo\": []\n"
            "}\n"
            "```"
        ),
        (
            "Тебя зовут Алексей. Добавил напоминание купить кофе.\n\n"
            "### STATE\n" 
            "```json\n"
            "{\n"
            "  \"summary\": \"Подтвердили имя и добавили задачу.\",\n"
            "  \"focus\": \"управление мелкими задачами\",\n"
            "  \"entities\": [\"Алексей\", \"кофе\"],\n"
            "  \"todo\": [\"купить кофе\"]\n"
            "}\n"
            "```"
        ),
    ]

    # Swap dependencies with fakes
    main.requests = FakeRequests()
    main.state.openai_client = FakeOpenAI(replies)

    # Create a session via first request
    bg = DummyBG()
    r1 = main.process_request(Req("user1", "Привет! Запомни, что меня зовут Алексей."), bg, speak=True)
    print("R1:", r1)
    print("STATE1:", main.state.sessions[("user1", os.getenv("ASTRA_PERSONALITY", "default").lower())].dialog_state)
    assert "### STATE" not in r1

    # Second turn referencing earlier
    r2 = main.process_request(Req("user1", "А как меня зовут? И добавь в туду купить кофе."), bg, speak=False)
    print("R2:", r2)
    sess = main.state.sessions[("user1", os.getenv("ASTRA_PERSONALITY", "default").lower())]
    print("STATE2:", sess.dialog_state)
    assert "Алексей" in r2
    assert "купить кофе" in (" ".join(sess.dialog_state.get("todo", [])))

    # Check background tasks recorded TTS on first only
    print("BG tasks:", [c[0] for c in bg.calls])


if __name__ == "__main__":
    run()
