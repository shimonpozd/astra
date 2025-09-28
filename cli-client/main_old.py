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
import re

from prompt_toolkit import Application
from prompt_toolkit.buffer import Buffer
from prompt_toolkit.layout.containers import HSplit, Window, ScrollOffsets
from prompt_toolkit.layout.controls import FormattedTextControl, BufferControl
from prompt_toolkit.layout.layout import Layout
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style

# Attempt to import tiktoken
try:
    import tiktoken
    tiktoken_encoding = tiktoken.get_encoding("cl100k_base")
except ImportError:
    tiktoken = None
    tiktoken_encoding = None

# --- Configuration ---
BRAIN_URL_STREAM = "http://localhost:7030/chat/stream"
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
SAVE_PATH = os.path.expanduser("~")

# --- Application State ---
class AppState:
    def __init__(self):
        self.running = True
        self.chat_history = []  # Source of truth for chat messages
        self.streaming_message = None # Holds the current streaming message from the assistant
        self.cpu_usage = 0.0
        self.ram_usage = 0.0
        self.vram_usage = 0.0
        self.tokens_sent = 0
        self.tokens_received = 0
        self.redis_connected = False
        self.app: Application | None = None

    def add_message(self, role, text):
        # For full messages, add to history
        self.chat_history.append({
            "role": role,
            "text": text,
            "ts": datetime.now()
        })
        if self.app:
            self.app.invalidate()

    def start_streaming_message(self, role):
        self.streaming_message = {
            "role": role,
            "text": "",
            "ts": datetime.now()
        }

    def append_to_streaming_message(self, chunk):
        if self.streaming_message:
            self.streaming_message["text"] += chunk
            if self.app:
                self.app.invalidate()

    def finalize_streaming_message(self):
        if self.streaming_message:
            self.chat_history.append(self.streaming_message)
            self.streaming_message = None
            if self.app:
                self.app.invalidate()

    def clear_chat(self):
        self.chat_history = []
        self.tokens_sent = 0
        self.tokens_received = 0
        if self.app:
            self.app.invalidate()

    def save_chat(self):
        filename = f"astra_chat_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        filepath = os.path.join(SAVE_PATH, filename)
        try:
            full_text = ""
            for msg in self.chat_history:
                ts = msg['ts'].strftime('[%H:%M:%S]')
                role_text = msg['role'].capitalize() if msg['role'] != 'user' else 'You'
                role_text = f"{role_text} >>> "
                full_text += f"{ts} {role_text} {msg['text']}\n"
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(full_text)
            self.add_message("system", f"Chat saved to {filepath}")
        except Exception as e:
            self.add_message("system", f"Error saving chat: {e}")

state = AppState()

# --- Token Counting ---
def count_tokens(text: str) -> int:
    if tiktoken:
        return len(tiktoken_encoding.encode(text))
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
                threading.Thread(target=send_message, args=(message['data'],), daemon=True).start()
    except redis.exceptions.ConnectionError:
        state.redis_connected = False
    finally:
        state.redis_connected = False

# --- Message Sending Logic ---
def send_message(user_text: str):
    state.add_message("user", user_text)
    state.tokens_sent += count_tokens(user_text)

    payload = {"text": user_text}
    
    try:
        state.start_streaming_message("assistant")
        decoder = codecs.getincrementaldecoder('utf-8')()
        with requests.post(BRAIN_URL_STREAM, json=payload, stream=True, timeout=30) as response:
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=8):
                if not state.running:
                    break
                if chunk:
                    decoded_chunk = decoder.decode(chunk)
                    if decoded_chunk:
                        state.append_to_streaming_message(decoded_chunk)
            decoded_chunk = decoder.decode(b'', final=True)
            if decoded_chunk:
                state.append_to_streaming_message(decoded_chunk)

        if state.streaming_message:
            state.tokens_received += count_tokens(state.streaming_message['text'])
        state.finalize_streaming_message()

    except requests.RequestException as e:
        state.finalize_streaming_message() # Finalize even on error
        state.add_message("system", f"Connection to brain-service failed: {e}")
    except Exception as e:
        state.finalize_streaming_message() # Finalize even on error
        state.add_message("system", f"An unexpected error occurred: {e}")

# --- UI Components ---
style = Style.from_dict({
    'status': 'bg:#263238 #eceff1',
    'status.rt_on': 'bg:#263238 #ffeb3b',
    'header': 'bg:#263238 #ffffff bold',
    'user': 'bold #4caf50',         # Green
    'assistant': 'bold #00bcd4',  # Cyan
    'system': 'bold #82b1ff',       # Light Blue
    'error': 'bold #e53935',        # Red
    'timestamp': '#888888',
})

def get_formatted_chat_text():
    fragments = []
    history = state.chat_history + ([state.streaming_message] if state.streaming_message else [])
    for msg in history:
        ts = msg['ts'].strftime('[%H:%M:%S]')
        role = msg['role']
        role_text = role.capitalize() if role != 'user' else 'You'
        role_text = f"{role_text} >>> "
        
        style_class = f'class:{role}'
        fragments.append((style_class, f"{ts} {role_text}"))
        fragments.append(('class:default', msg['text']))
        fragments.append(('', '\n'))
    return fragments


def get_header():
    return [('class:header', ' ASSISTANT CLI '), ('class:header', ' /help for commands ')]

def get_bottom_toolbar():
    rt_status = "RT=ON" if state.redis_connected else "RT=OFF"
    rt_style = "class:status.rt_on" if state.redis_connected else "class:status"

    tokens_str = f"⬇︎{state.tokens_sent} ⬆︎{state.tokens_received}"
    sys_str = f"CPU {state.cpu_usage:.0f}% | RAM {state.ram_usage:.0f}% | VRAM {state.vram_usage:.0f}%"
    
    return [
        ('class:status', f" {tokens_str} "),
        (rt_style, f" {rt_status} "),
        ('class:status', f" {sys_str} "),
    ]

# --- Main Application ---
chat_window = None

def main():
    global chat_window

    threading.Thread(target=update_system_stats, daemon=True).start()
    threading.Thread(target=redis_listener_thread, daemon=True).start()

    header = Window(content=FormattedTextControl(get_header), height=1, style='class:header')
    chat_window = Window(
        content=FormattedTextControl(get_formatted_chat_text, focusable=False),
        wrap_lines=True,
        scroll_offsets=ScrollOffsets(top=10000, bottom=10000) # Large scrollback
    )
    input_buffer = Buffer()
    
    def get_input_prompt():
        return [('class:user', 'You >>> ')]

    input_field = Window(
        content=BufferControl(buffer=input_buffer),
        get_line_prefix=get_input_prompt,
        height=1
    )

    status_toolbar = Window(content=FormattedTextControl(get_bottom_toolbar), height=1, style='class:status')

    root_container = HSplit([
        header,
        chat_window,
        input_field,
        status_toolbar,
    ])
    
    layout = Layout(root_container, focused_element=input_field)

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

    @bindings.add('enter')
    def _(event):
        user_text = input_buffer.text.strip()
        input_buffer.reset()
        if user_text:
            if user_text == "/help":
                state.add_message("system", "Hotkeys: Ctrl-L (Clear), Ctrl-S (Save), Ctrl-C/Q (Quit)")
            else:
                threading.Thread(target=send_message, args=(user_text,), daemon=True).start()

    state.app = Application(layout=layout, key_bindings=bindings, style=style, full_screen=True, refresh_interval=0.1)
    
    try:
        state.app.run()
    finally:
        state.running = False
        print("Exiting.")

if __name__ == "__main__":
    if not sys.stdout.isatty():
        print("This is a terminal application and must be run in a TTY.")
        sys.exit(1)
    main()
