import os
import sys
import time
import requests
import psutil
import threading
import redis
from datetime import datetime
import json
import codecs

from prompt_toolkit import Application
from prompt_toolkit.buffer import Buffer
from prompt_toolkit.layout.containers import HSplit, Window
from prompt_toolkit.layout.controls import FormattedTextControl
from prompt_toolkit.layout.layout import Layout
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style
from prompt_toolkit.widgets import TextArea
from prompt_toolkit.buffer import EditReadOnlyBuffer
# --- Configuration ---
BRAIN_URL_STREAM = "http://localhost:7030/chat/stream"
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
SAVE_PATH = os.path.expanduser("~")

# --- Application State ---
class AppState:
    def __init__(self):
        self.running = True
        # Chat output area: read-only, scrollable, wraps long lines
        self.chat_area: TextArea | None = None
        # Single-line input buffer with explicit accept handler
        self.input_area: TextArea | None = None

        self.cpu_usage = 0.0
        self.ram_usage = 0.0
        self.vram_usage = 0.0  # Placeholder for VRAM
        self.tokens_sent = 0
        self.tokens_received = 0
        self.redis_connected = False
        self.app: Application | None = None

    # Append a message to the chat and auto-scroll to bottom.
    def add_message(self, role: str, text: str, is_error: bool = False, is_streaming_chunk: bool = False):
        if not self.chat_area:
            return
        if not is_streaming_chunk:
            ts = datetime.now().strftime('[%H:%M:%S]')
            role_map = {
                'user': 'You >>>',
                'assistant': 'Assistant >>>',
                'system': 'System:'
            }
            role_text = role_map.get(role, '')
            chunk = f"{ts} {role_text} {text}\n"
            self.chat_area.buffer.insert_text(chunk, move_cursor=True)
            self.chat_area.buffer.cursor_position = len(self.chat_area.buffer.text)
        else:
            chunk = text
            self.chat_area.buffer.insert_text(chunk, move_cursor=True)
            self.chat_area.buffer.cursor_position = len(self.chat_area.buffer.text)
        if self.app:
            self.app.invalidate()
    def clear_chat(self):
        if self.chat_area:
            self.chat_area.text = ""
            self.chat_area.buffer.cursor_position = 0
        self.tokens_sent = 0
        self.tokens_received = 0
        if self.app:
            self.app.invalidate()
    def save_chat(self):
        filename = f"astra_chat_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        filepath = os.path.join(SAVE_PATH, filename)
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(self.chat_area.text if self.chat_area else "")
            self.add_message("system", f"Chat saved to {filepath}")
        except Exception as e:
            self.add_message("system", f"Error saving chat: {e}", is_error=True)
state = AppState()

# --- (Optional) Token Counting using tiktoken if present ---
try:
    import tiktoken  # type: ignore
    tiktoken_encoding = tiktoken.get_encoding("cl100k_base")
except Exception:
    tiktoken = None  # type: ignore
    tiktoken_encoding = None  # type: ignore

def count_tokens(text: str) -> int:
    if tiktoken:
        try:
            return len(tiktoken_encoding.encode(text))  # type: ignore
        except Exception:
            pass
    return len(text.split())

# --- Background Tasks ---
def update_system_stats():
    while state.running:
        state.cpu_usage = psutil.cpu_percent()
        state.ram_usage = psutil.virtual_memory().percent
        state.vram_usage = 0.0
        if state.app:
            state.app.invalidate()
        time.sleep(2)

def redis_listener_thread():
    try:
        r = redis.from_url(REDIS_URL, decode_responses=True)
        r.ping()
        state.redis_connected = True
        pubsub = r.pubsub()
        pubsub.subscribe("astra:stt_recognized")
        for message in pubsub.listen():
            if not state.running:
                break
            if message['type'] == 'message':
                state.add_message("user", message['data'])
    except redis.exceptions.ConnectionError:
        state.redis_connected = False
    finally:
        state.redis_connected = False

# --- Message Sending Logic ---
def send_message(user_text: str):
    state.add_message("user", user_text)
    state.tokens_sent += count_tokens(user_text)

    payload = {"text": user_text}
    full_reply = ""

    try:
        # Start assistant streaming line
        state.add_message("assistant", "", is_streaming_chunk=False)
        # Rewind 1 line (remove trailing newline effect) by simply continuing streaming
        decoder = codecs.getincrementaldecoder('utf-8')()
        with requests.post(BRAIN_URL_STREAM, json=payload, stream=True, timeout=30) as response:
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=16):
                if not state.running:
                    break
                if chunk:
                    decoded_chunk = decoder.decode(chunk)
                    if decoded_chunk:
                        full_reply += decoded_chunk
                        state.add_message("assistant", decoded_chunk, is_streaming_chunk=True)
            # flush the decoder
            decoded_chunk = decoder.decode(b'', final=True)
            if decoded_chunk:
                full_reply += decoded_chunk
                state.add_message("assistant", decoded_chunk, is_streaming_chunk=True)

        # Ensure newline after stream
        if state.chat_area and not state.chat_area.text.endswith("\n"):
            state.chat_area.buffer.insert_text("\n", move_cursor=True)

        state.tokens_received += count_tokens(full_reply)
        if state.app:
            state.app.invalidate()

    except requests.RequestException as e:
        state.add_message("system", f"Connection to brain-service failed: {e}", is_error=True)
    except Exception as e:
        state.add_message("system", f"An unexpected error occurred: {e}", is_error=True)

# --- UI Components ---
style = Style.from_dict({
    'user_prompt': 'bold #4caf50',
    'assistant_prompt': 'bold #00bcd4',
    'timestamp': '#888888 italic',
    'status': 'bg:#263238 #eceff1',
    'status.rt_on': 'bg:#263238 #ffeb3b',
    'header': 'bg:#263238 #ffffff bold',
    'error': 'bold #e53935',
    'system': '#82b1ff',
})

def get_header():
    return [('class:header', ' ASSISTANT CLI '), ('class:header', ' /help for commands ')]

def get_bottom_toolbar():
    rt_status = "RT=ON" if state.redis_connected else "RT=OFF"
    rt_style = "class:status.rt_on" if state.redis_connected else "class:status"
    tokens_str = f"⬇︎{state.tokens_received} ⬆︎{state.tokens_sent}"
    sys_str = f"CPU {state.cpu_usage:.0f}% | RAM {state.ram_usage:.0f}% | VRAM {state.vram_usage:.0f}%"
    return [
        ('class:status', f" {tokens_str} "),
        (rt_style, f" {rt_status} "),
        ('class:status', f" {sys_str} "),
    ]

def main():
    threading.Thread(target=update_system_stats, daemon=True).start()
    threading.Thread(target=redis_listener_thread, daemon=True).start()

    header = Window(content=FormattedTextControl(get_header), height=1, style='class:header')

    # Chat output area (read-only, scrollable, wraps lines).
    state.chat_area = TextArea(
        text="",
        read_only=False,          # Program can write; user can't focus it.
        focusable=False,
        scrollbar=True,
        wrap_lines=True
    )

    # Input area: single-line; Enter submits via accept_handler.
    def on_enter(buf: Buffer) -> bool | None:
        user_text = buf.text.strip()
        if not user_text:
            return False
        if user_text == "/help":
            state.add_message("system", "Hotkeys: Ctrl-L (Clear), Ctrl-S (Save), Ctrl-C/Q (Quit), Up/Down/PgUp/PgDown (Scroll), Home/End (Top/Bottom)")
        else:
            threading.Thread(target=send_message, args=(user_text,), daemon=True).start()
        buf.text = ""
        return False  # Don't insert a newline

    state.input_area = TextArea(
        height=1,
        prompt=[('class:user_prompt', 'You >>> ')],
        multiline=False,
        wrap_lines=False,
        accept_handler=on_enter
    )

    status_toolbar = Window(content=FormattedTextControl(get_bottom_toolbar), height=1, style='class:status')

    root_container = HSplit([
        header,
        state.chat_area,
        state.input_area,
        status_toolbar,
    ])

    layout = Layout(root_container, focused_element=state.input_area)

    # --- Keybindings ---
    bindings = KeyBindings()

    @bindings.add('c-c')
    @bindings.add('c-q')
    def _(event):
        state.running = False
        event.app.exit()

    @bindings.add('c-l')
    def _(event):
        state.clear_chat()

    @bindings.add('c-s')
    def _(event):
        state.save_chat()

    # Scroll the chat area without changing focus.
    @bindings.add('up')
    def _(event):
        if state.chat_area:
            state.chat_area.buffer.cursor_up(count=1)

    @bindings.add('down')
    def _(event):
        if state.chat_area:
            state.chat_area.buffer.cursor_down(count=1)

    @bindings.add('pageup')
    def _(event):
        if state.chat_area:
            for _ in range(15):
                state.chat_area.buffer.cursor_up(count=1)

    @bindings.add('pagedown')
    def _(event):
        if state.chat_area:
            for _ in range(15):
                state.chat_area.buffer.cursor_down(count=1)

    @bindings.add('home')
    def _(event):
        if state.chat_area:
            state.chat_area.buffer.cursor_position = 0

    @bindings.add('end')
    def _(event):
        if state.chat_area:
            state.chat_area.buffer.cursor_position = len(state.chat_area.buffer.text or "")

    state.app = Application(
        layout=layout,
        key_bindings=bindings,
        style=style,
        full_screen=True,
        mouse_support=True,      # Enable mouse wheel scroll.
        refresh_interval=0.1
    )

    try:
        state.app.run()
    finally:
        state.running = False
        print("Exiting.")

if __name__ == "__main__":
    main()