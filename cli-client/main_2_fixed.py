#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import time
import json
import codecs
import threading
from datetime import datetime

import requests
import psutil
import redis
import pyperclip

from prompt_toolkit import Application
from prompt_toolkit.buffer import Buffer
from prompt_toolkit.layout.containers import HSplit, VSplit, Window
from prompt_toolkit.layout.controls import FormattedTextControl
from prompt_toolkit.layout.layout import Layout
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style
from prompt_toolkit.widgets import TextArea, ScrollablePane
from prompt_toolkit.formatted_text import to_formatted_text

# --- Configuration ---
BRAIN_URL_STREAM = "http://localhost:7030/chat/stream"
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
SAVE_PATH = os.path.expanduser("~")

AGENT_ID = os.getenv("ASTRA_AGENT_ID", "default")
USER_ID = os.getenv("ASTRA_USER_ID", "default_user")

# --- (Optional) Token Counting ---
try:
    import tiktoken
    _enc = tiktoken.get_encoding("cl100k_base")
except Exception:
    tiktoken = None
    _enc = None


def count_tokens(text: str) -> int:
    if tiktoken and _enc is not None:
        try:
            return len(_enc.encode(text))
        except Exception:
            pass
    # Простой фолбэк
    return max(1, len(text.split()))


# --- Application State ---
class AppState:
    def __init__(self):
        self.running = True

        # Хранилище форматированного чата: список (style, text)
        self.chat_fragments: list[tuple[str, str]] = []
        self.chat_window: Window | None = None
        self.input_area: TextArea | None = None

        self.cpu_usage = 0.0
        self.ram_usage = 0.0
        self.vram_usage = 0.0  # не считаем здесь — оставлено под будущий сбор VRAM
        self.tokens_sent = 0
        self.tokens_received = 0
        self.redis_connected = False

        self.app: Application | None = None

    def _append(self, style: str, text: str):
        self.chat_fragments.append((style, text))

    def add_message(self, role: str, text: str, is_error: bool = False, is_streaming_chunk: bool = False):
        """Добавляет сообщение/чанк с нужным стилем.
        - Не-стриминговые сообщения получают таймстемп и префикс роли.
        - Стриминговые чанки ассистента добавляются «как есть», без префикса.
        """
        if not self.chat_window:
            return

        if not is_streaming_chunk:
            ts = datetime.now().strftime('[%H:%M:%S]')
            role_map = {
                'user': ('You >>>', 'class:chat.user'),
                'assistant': ('Assistant >>>', 'class:chat.assistant'),
                'system': ('System:', 'class:chat.system'),
            }
            role_label, role_style = role_map.get(role, ('', 'class:chat.system'))

            self._append('class:chat.ts', f'{ts} ')
            if role_label:
                self._append(role_style, f'{role_label} ')
            final_style = 'class:error' if is_error else role_style
            # Гарантируем перевод строки для завершённых сообщений
            if not text.endswith('\n'):
                text = text + '\n'
            self._append(final_style, text)
        else:
            # Потоковый чанк — без префикса, без принудительного \n
            self._append('class:chat.assistant', text)

        # Автоскролл к низу
        if self.app:
            self.app.invalidate()

    def clear_chat(self):
        self.chat_fragments = []
        self.tokens_sent = 0
        self.tokens_received = 0
        if self.app:
            self.app.invalidate()

    def save_chat(self):
        filename = f"astra_chat_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        filepath = os.path.join(SAVE_PATH, filename)
        try:
            chat_text = "".join([text for _, text in self.chat_fragments])
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(chat_text)
            self.add_message("system", f"Chat saved to {filepath}")
        except Exception as e:
            self.add_message("system", f"Error saving chat: {e}", is_error=True)


state = AppState()


# --- Background Tasks ---
def update_system_stats():
    while state.running:
        state.cpu_usage = psutil.cpu_percent()
        state.ram_usage = psutil.virtual_memory().percent
        # Оставлено под будущий сбор VRAM (NVML/PyCUDA), пока 0.0
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
            if message.get('type') == 'message':
                if state.input_area:
                    # Заполняем инпут и имитируем Enter
                    state.input_area.buffer.text = message['data']
                    state.input_area.buffer.validate_and_handle()
    except redis.exceptions.ConnectionError:
        state.redis_connected = False
    except Exception:
        state.redis_connected = False
    finally:
        state.redis_connected = False
        if state.app:
            state.app.invalidate()


# --- Message Sending Logic (stream) ---
def send_message(user_text: str):
    state.add_message("user", user_text)
    state.tokens_sent += count_tokens(user_text)
    payload = {
        "user_id": USER_ID,
        "text": user_text,
        "agent_id": AGENT_ID
    }
    full_reply = ""

    try:
        # Открываем «линию» ассистента (без текста, чтобы чанк шел сразу после префикса)
        state.add_message("assistant", "", is_streaming_chunk=False)

        decoder = codecs.getincrementaldecoder('utf-8')()
        with requests.post(BRAIN_URL_STREAM, json=payload, stream=True, timeout=300) as response:
            response.raise_for_status()

            for chunk in response.iter_content(chunk_size=16):
                if not state.running:
                    break
                if not chunk:
                    continue
                part = decoder.decode(chunk)
                if part:
                    full_reply += part
                    state.add_message("assistant", part, is_streaming_chunk=True)

            # Хвост декодера
            tail = decoder.decode(b'', final=True)
            if tail:
                full_reply += tail
                state.add_message("assistant", tail, is_streaming_chunk=True)

        # Закрывающий перевод строки, чтобы следующий блок начинался с новой строки
        state._append('', '\n')

        state.tokens_received += count_tokens(full_reply)
        if state.app:
            state.app.invalidate()

    except requests.RequestException as e:
        state.add_message("system", f"Connection to brain-service failed: {e}", is_error=True)
    except Exception as e:
        state.add_message("system", f"An unexpected error occurred: {e}", is_error=True)


# --- UI Components / Styles ---
style = Style.from_dict({
    # Базовый фон и цвет — «матрица»
    '': 'bg:#000000 #00aa00',
    'header': 'bg:#001b00 #00ff88 bold',
    'status': 'bg:#001b00 #66ff66',
    'status.rt_on': 'bg:#001b00 #ccff66',

    # Чат
    'chat.ts': '#228b22 italic',     # таймстемп
    'chat.user': 'bold #00ff00',     # пользователь — яркий зелёный
    'chat.assistant': '#66ff66',     # ассистент — светлее
    'chat.system': 'bold #ffd166',   # системные — янтарный контраст
    'error': 'bold #ff6b6b',         # ошибки — красный

    # Промпт ввода
    'user_prompt': 'bold #00ff88',
})


def get_header():
    return [
        ('class:header', ' ASSISTANT CLI '),
        ('class:header', ' /help for commands '),
    ]


def get_bottom_toolbar():
    rt_status = "RT=ON" if state.redis_connected else "RT=OFF"
    rt_style = "class:status.rt_on" if state.redis_connected else "class:status"
    tokens_str = f"⬇︎{state.tokens_received} ⬆︎{state.tokens_sent}"
    sys_str = f"CPU {state.cpu_usage:.0f}% | RAM {state.ram_usage:.0f}%"
    return [
        ('class:status', f" {tokens_str} "),
        (rt_style, f" {rt_status} "),
        ('class:status', f" {sys_str} "),
    ]


def main():
    # Фоновые задачи
    threading.Thread(target=update_system_stats, daemon=True).start()
    threading.Thread(target=redis_listener_thread, daemon=True).start()

    # Header
    header = Window(content=FormattedTextControl(get_header), height=1, style='class:header')

    # Чат как форматированный контрол
    def _render_chat():
        return to_formatted_text(state.chat_fragments, style='')

    chat_control = FormattedTextControl(_render_chat, focusable=True, show_cursor=False)
    chat_window = Window(
        content=chat_control,
        wrap_lines=True,             # перенос длинных строк
        always_hide_cursor=True,
        dont_extend_height=False
    )
    state.chat_window = chat_window

    # Прокручиваемая обёртка для чата
    chat_scrollable = ScrollablePane(
        HSplit([chat_window]),
        show_scrollbar=True
    )


    # Боковые поля (чтобы текст не прилипал к краям)
    chat_with_margins = VSplit([
        Window(width=2, char=' '),   # слева
        chat_scrollable,
        Window(width=2, char=' '),   # справа
    ])

    # Обработчик Enter
    def on_enter(buf: Buffer) -> bool | None:
        user_text = buf.text.strip()
        if not user_text:
            return False
        if user_text == "/help":
            state.add_message(
                "system",
                "Commands: /help, /clear\n"
                "Hotkeys: Ctrl-C/Q (Quit), Ctrl-L (Clear), Ctrl-S (Save), "
                "Ctrl-Y (Copy last assistant reply), Ctrl-A (Copy entire chat), "
                "PgUp/PgDn/Home/End (Scroll)."
            )
        elif user_text == "/clear":
            state.clear_chat()
        else:
            threading.Thread(target=send_message, args=(user_text,), daemon=True).start()
        buf.text = ""
        return False

    # Поле ввода
    state.input_area = TextArea(
        height=1,
        prompt=[('class:user_prompt', 'You >>> ')],
        multiline=False,
        wrap_lines=False,
        accept_handler=on_enter
    )

    # Нижняя строка статуса
    status_toolbar = Window(
        content=FormattedTextControl(get_bottom_toolbar),
        height=1,
        style='class:status'
    )

    # Компоновка
    root_container = HSplit([
        header,
        chat_with_margins,
        state.input_area,
        status_toolbar,
    ])

    layout = Layout(root_container, focused_element=state.input_area)

    # Горячие клавиши
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

    @bindings.add('c-y')
    def _(event):
        """Скопировать последнюю завершённую реплику ассистента (до ближайшего \n)."""
        buf_parts: list[str] = []
        found_any = False
        for st, tx in reversed(state.chat_fragments):
            # Накапливаем только ассистента
            if st == 'class:chat.assistant':
                buf_parts.append(tx)
                found_any = True
            # Стоп, если встретили перевод строки и у нас уже есть накопление
            if tx.endswith('\n') and found_any:
                break

        s = ''.join(reversed(buf_parts)).strip()
        if s:
            pyperclip.copy(s)
            state.add_message('system', 'Last assistant reply copied to clipboard.')
        else:
            state.add_message('system', 'No assistant reply found to copy.', is_error=True)

    @bindings.add('c-a')
    def _(event):
        chat_text = "".join([text for _, text in state.chat_fragments])
        pyperclip.copy(chat_text)
        state.add_message('system', 'Entire chat copied to clipboard.')

    # Скролл чата клавишами (работает даже при фокусе в инпуте)
    @bindings.add('up')
    def _(event):
        if state.chat_window:
            state.chat_window.vertical_scroll = max(0, state.chat_window.vertical_scroll - 1)
            event.app.invalidate()

    @bindings.add('down')
    def _(event):
        if state.chat_window:
            state.chat_window.vertical_scroll += 1
            event.app.invalidate()

    @bindings.add('pageup')
    def _(event):
        if state.chat_window:
            state.chat_window.vertical_scroll = max(0, state.chat_window.vertical_scroll - 10)
            event.app.invalidate()

    @bindings.add('pagedown')
    def _(event):
        if state.chat_window:
            state.chat_window.vertical_scroll += 10
            event.app.invalidate()

    @bindings.add('home')
    def _(event):
        if state.chat_window:
            state.chat_window.vertical_scroll = 0
            event.app.invalidate()

    @bindings.add('end')
    def _(event):
        if state.chat_window:
            state.chat_window.vertical_scroll = 10 ** 9
            event.app.invalidate()

    # Приложение
    state.app = Application(
        layout=layout,
        key_bindings=bindings,
        style=style,
        full_screen=True,
        mouse_support=True,    # даём поддержку мыши (скролл колёсиком у окна чата)
        refresh_interval=0.1
    )

    try:
        state.app.run()
    finally:
        state.running = False
        print("Exiting.")


if __name__ == "__main__":
    main()
