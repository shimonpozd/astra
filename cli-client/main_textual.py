#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import asyncio
import argparse
import unicodedata
from datetime import datetime
from bidi.algorithm import get_display

import httpx
import psutil
import redis.asyncio as redis
import pyperclip
from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, RichLog, Input, Static
from textual.binding import Binding
from textual.reactive import reactive
from rich.text import Text

# --- Configuration ---
BRAIN_URL_STREAM = "http://localhost:7030/chat/stream"
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
SAVE_PATH = os.path.expanduser("~")
USER_ID = os.getenv("ASTRA_USER_ID", "default_user")

# --- BiDi helpers ---
RTL_BIDI_CATS = {"R", "AL", "RLE", "RLO", "RLI", "AN"}

RLM = "\u200f"
LRM = "\u200e"

ENABLE_BIDI_VISUAL = True

def _has_rtl(s: str) -> bool:
    for ch in s:
        if unicodedata.bidirectional(ch) in RTL_BIDI_CATS:
            return True
    return False

def _escape_markup(s: str) -> str:
    return s.replace("[", r"\[").replace("]", r"\]")

def _stabilize_bidi(s: str) -> str:
    if not s or not _has_rtl(s):
        return s

    out = []
    prev = None
    for ch in s:
        cat = unicodedata.bidirectional(ch)
        if prev in ("L", "EN", "ES", "ET") and cat in RTL_BIDI_CATS:
            out.append(LRM)
        out.append(ch)
        prev = cat
    s2 = "".join(out)

    if ENABLE_BIDI_VISUAL:
        s2 = get_display(s2, base_dir='R')

    return s2

class ChatApp(App):
    TITLE = "Ramstan-AI"
    CSS_PATH = "main_textual.css"

    BINDINGS = [
        Binding("ctrl+c,ctrl+q", "quit", "Quit", show=True),
        Binding("ctrl+l", "clear_log", "Clear Log", show=True),
        Binding("ctrl+s", "save_log", "Save Log", show=True),
    ]

    cpu_usage = reactive(0.0)
    ram_usage = reactive(0.0)
    redis_status = reactive("RT=OFF")
    streaming_content = reactive(Text(""))

    def __init__(self, agent_id: str):
        super().__init__()
        self.agent_id = agent_id

    def compose(self) -> ComposeResult:
        yield Header()
        yield RichLog(id="log", wrap=True, highlight=True, markup=True)
        yield Static(id="streaming-display")
        yield Input(placeholder="Type your message...", id="input")
        yield Footer()

    async def on_mount(self) -> None:
        self.log_widget = self.query_one(RichLog)
        self.input_widget = self.query_one(Input)
        self.streaming_widget = self.query_one("#streaming-display")
        self.run_worker(self.update_system_stats, thread=True, name="System Stats")
        self.run_worker(self.redis_listener, thread=True, name="Redis Listener")
        self.log_widget.write(f"[bold yellow]Welcome to Astra CLI! Agent: '{self.agent_id}'[/]. Use Windows Terminal for best results.")
        self.input_widget.focus()

    def watch_streaming_content(self, content: Text) -> None:
        self.streaming_widget.update(content)

    async def update_system_stats(self) -> None:
        while self.is_running:
            self.cpu_usage = psutil.cpu_percent()
            self.ram_usage = psutil.virtual_memory().percent
            await asyncio.sleep(2)

    async def redis_listener(self) -> None:
        try:
            r = redis.from_url(REDIS_URL, decode_responses=True)
            await r.ping()
            self.redis_status = "RT=ON"
            pubsub = r.pubsub()
            await pubsub.subscribe("astra:stt_recognized")
            while self.is_running:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get('type') == 'message':
                    self.call_from_thread(self.submit_text, message['data'])
        except (redis.exceptions.ConnectionError, asyncio.TimeoutError):
            self.redis_status = "RT=OFF"
        finally:
            if self.is_running:
                self.redis_status = "RT=OFF"

    def watch_cpu_usage(self, _: float) -> None: self.update_footer()
    def watch_ram_usage(self, _: float) -> None: self.update_footer()
    def watch_redis_status(self, _: str) -> None: self.update_footer()

    def update_footer(self) -> None:
        footer_text = f"CPU: {self.cpu_usage:.0f}% | RAM: {self.ram_usage:.0f}% | {self.redis_status}"
        self.query_one(Footer).text = footer_text

    def log_message(self, role: str, text: str) -> None:
        ts = datetime.now().strftime('[%H:%M:%S]')
        role_style = {"user": "bold green", "assistant": "cyan", "system": "bold yellow", "error": "bold red"}
        style = role_style.get(role, "white")
        
        if _has_rtl(text):
            content = _stabilize_bidi(text)
            message = Text(f"{ts} {role.capitalize()} >>> ")
            message.append(content)
            self.log_widget.write(message)
        else:
            self.log_widget.write(f"[{style}]{ts} {role.capitalize()} >>> {text}[/]")

    def submit_text(self, text: str) -> None:
        text = text.strip()
        if not text:
            return
        if text.lower() == "/clear":
            self.action_clear_log()
            return
        self.log_message("user", text)
        async def worker():
            await self.send_message_to_brain(text)
        self.run_worker(worker, name=f"Brain request for: {text[:20]}...")

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        self.submit_text(event.value)
        self.input_widget.clear()

    async def send_message_to_brain(self, user_text: str) -> None:
        payload = {"user_id": USER_ID, "text": user_text, "agent_id": self.agent_id}
        ts = datetime.now().strftime('[%H:%M:%S]')
        plain_prefix = f"{ts} Assistant >>> "
        full_response = ""
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                async with client.stream("POST", BRAIN_URL_STREAM, json=payload) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_text():
                        full_response += chunk
                        has_rtl = _has_rtl(full_response)
                        processed_response = _stabilize_bidi(full_response) if has_rtl else full_response
                        if has_rtl:
                            plain_text_content = plain_prefix + _escape_markup(processed_response)
                            self.streaming_content = Text(plain_text_content)
                        else:
                            markup_content = f"[cyan]{plain_prefix}[/cyan]" + processed_response
                            self.streaming_content = Text.from_markup(markup_content)
            self.log_message("assistant", full_response)
            self.streaming_content = Text("")
        except httpx.HTTPStatusError as e:
            self.log_message("error", f"HTTP Error: {e.response.status_code} - {e.response.text}")
            self.streaming_content = Text("")
        except Exception as e:
            self.log_message("error", f"An unexpected error occurred: {e}")
            self.streaming_content = Text("")

    def action_clear_log(self) -> None:
        self.log_widget.clear()

    def action_save_log(self) -> None:
        filename = f"astra_chat_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        filepath = os.path.join(SAVE_PATH, filename)
        try:
            log_text = self.log_widget.export_text(styles=False)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(log_text)
            self.log_message("system", f"Log saved to {filepath}")
        except Exception as e:
            self.log_message("error", f"Failed to save log: {e}")

if __name__ == "__main__":
    default_agent_id = os.getenv("ASTRA_AGENT_ID", "default")
    try:
        with open(os.path.join(os.path.dirname(__file__), "..", ".astra_personality"), "r") as f:
            default_agent_id = f.read().strip()
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"Warning: Could not read .astra_personality file: {e}")

    parser = argparse.ArgumentParser(description="Astra CLI Client")
    parser.add_argument("--agent-id", default=default_agent_id, help="The agent ID (personality) to use.")
    args = parser.parse_args()
    
    app = ChatApp(agent_id=args.agent_id)
    app.run()
