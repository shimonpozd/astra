#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import asyncio
import argparse
import json
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
from textual.containers import Horizontal, Vertical
from rich.text import Text
from rich.console import Console
from rich.table import Table

# Token counting (optional)
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
    return max(1, len(text.split()))

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
    TITLE = "🚀 Ramstan-AI Neural Terminal"

    CSS = """
    Screen {
        background: #000000;
        color: #00ff00;
    }
    
    Header {
        background: #001100;
        color: #00ff00;
        text-style: bold;
    }
    
    Footer {
        background: #001100;
        color: #00ff00;
    }
    
    #main-container {
        background: #000000;
    }
    
    #chat-container {
        background: #000000;
    }
    
    #log {
        background: #000000;
        border: solid #003300;
        scrollbar-background: #001100;
        scrollbar-color: #00aa00;
    }
    
    #input {
        background: #001100;
        color: #00ff00;
        border: solid #00aa00;
    }
    
    #stats-panel {
        background: #000000;
        color: #00ff00;
        border: solid #003300;
        width: 24;
        padding: 1;
    }
    """

    BINDINGS = [
        Binding("ctrl+c,ctrl+q", "quit", "Quit", show=True),
        Binding("ctrl+l", "clear_log", "Clear", show=True),
        Binding("ctrl+s", "save_log", "Save", show=True),
        Binding("ctrl+y", "copy_last", "Copy Last", show=True),
        Binding("ctrl+a", "copy_all", "Copy All", show=True),
        Binding("f1", "show_help", "Help", show=True),
        Binding("f2", "show_stats", "Stats", show=True),
    ]

    # Reactive variables
    cpu_usage = reactive(0.0)
    ram_usage = reactive(0.0)
    vram_usage = reactive(0.0)
    redis_status = reactive("RT=OFF")
    tokens_sent = reactive(0)
    tokens_received = reactive(0)

    def __init__(self, agent_id: str):
        super().__init__()
        self.agent_id = agent_id
        self.last_assistant_message = ""
        self.message_history = []

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal(id="main-container"):
            with Vertical(id="chat-container"):
                yield RichLog(id="log", wrap=True, highlight=True, markup=True)
                yield Input(placeholder="Type your message... (/help for commands)", id="input")
            yield Static(id="stats-panel")
        yield Footer()

    async def on_mount(self) -> None:
        self.log_widget = self.query_one("#log", RichLog)
        self.input_widget = self.query_one("#input", Input)
        self.stats_widget = self.query_one("#stats-panel", Static)
        
        # Start background tasks
        self.run_worker(self.update_system_stats, thread=True, name="System Stats")
        self.run_worker(self.redis_listener, thread=True, name="Redis Listener")
        
        # Welcome message
        welcome_text = Text("🌟 NEURAL INTERFACE ACTIVATED 🌟\n", style="bold #00ff00")
        welcome_text.append(f"Agent: '{self.agent_id}' | Status: ONLINE\n", style="#00cc00")
        welcome_text.append("Use /help for commands | Ctrl+Q to exit\n", style="#00aa00 italic")
        self.log_widget.write(welcome_text)
        
        self.input_widget.focus()
        self.update_stats_display()

    def watch_cpu_usage(self, _: float) -> None: 
        self.update_footer()
        self.update_stats_display()
    
    def watch_ram_usage(self, _: float) -> None: 
        self.update_footer()
        self.update_stats_display()
    
    def watch_vram_usage(self, _: float) -> None: 
        self.update_stats_display()
    
    def watch_redis_status(self, _: str) -> None: 
        self.update_footer()
        self.update_stats_display()
    
    def watch_tokens_sent(self, _: int) -> None:
        self.update_stats_display()
    
    def watch_tokens_received(self, _: int) -> None:
        self.update_stats_display()

    async def update_system_stats(self) -> None:
        while self.is_running:
            self.cpu_usage = psutil.cpu_percent()
            self.ram_usage = psutil.virtual_memory().percent
            # VRAM можно добавить позже с pynvml
            self.vram_usage = 0.0
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

    def update_footer(self) -> None:
        rt_indicator = "🟢" if self.redis_status == "RT=ON" else "🔴"
        footer_text = f"CPU: {self.cpu_usage:.0f}% | RAM: {self.ram_usage:.0f}% | {rt_indicator}{self.redis_status}"
        self.query_one(Footer).text = footer_text

    def update_stats_display(self) -> None:
        stats_text = f"""🎯 Agent: {self.agent_id}

📊 SYSTEM
├ CPU: {self.cpu_usage:.1f}%
├ RAM: {self.ram_usage:.1f}%
└ VRAM: {self.vram_usage:.1f}%

🔗 REDIS
└ Status: {self.redis_status}

📈 TOKENS  
├ ⬆️ Sent: {self.tokens_sent}
└ ⬇️ Recv: {self.tokens_received}"""
        
        self.stats_widget.update(Text(stats_text, style="#00ff00"))

    def log_message(self, role: str, text: str, is_error: bool = False) -> None:
        ts = datetime.now().strftime('[%H:%M:%S]')
        
        # Create rich text message
        message = Text()
        message.append(f"{ts} ", style="#009900 italic")
        
        if role == "user":
            message.append("You >>> ", style="bold #00ff00")
            message.append(text, style="#00ff00")
        elif role == "assistant":
            message.append("🤖 Assistant >>> ", style="bold #00cc00")
            if _has_rtl(text):
                content = _stabilize_bidi(text)
                message.append(content, style="#00cc00")
            else:
                message.append(text, style="#00cc00")
            self.last_assistant_message = text
        elif role == "system":
            message.append("⚙️ System >>> ", style="bold #00ff66")
            message.append(text, style="#00ff66")
        elif role == "error":
            message.append("❌ Error >>> ", style="bold #ff0000")
            message.append(text, style="#ff0000")
        
        self.log_widget.write(message)
        
        # Store in history
        self.message_history.append({"role": role, "text": text, "timestamp": ts})

    def submit_text(self, text: str) -> None:
        text = text.strip()
        if not text:
            return
            
        # Handle commands
        if text.lower() == "/clear":
            self.action_clear_log()
            return
        elif text.lower() == "/help":
            self.action_show_help()
            return
        elif text.lower() == "/stats":
            self.action_show_stats()
            return
        elif text.lower() == "/copy":
            self.action_copy_last()
            return
            
        self.tokens_sent += count_tokens(text)
        self.log_message("user", text)
        
        async def worker():
            await self.send_message_to_brain(text)
        self.run_worker(worker, name=f"Brain request for: {text[:20]}...")

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        self.submit_text(event.value)
        self.input_widget.clear()

    async def send_message_to_brain(self, user_text: str) -> None:
        payload = {"user_id": USER_ID, "text": user_text, "agent_id": self.agent_id}
        full_response = ""
        
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                async with client.stream("POST", BRAIN_URL_STREAM, json=payload) as response:
                    response.raise_for_status()
                    
                    async for chunk in response.aiter_text():
                        full_response += chunk
                            
            self.tokens_received += count_tokens(full_response)
            self.log_message("assistant", full_response)
            
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP Error: {e.response.status_code} - {e.response.text}"
            self.log_message("error", error_msg, is_error=True)
        except Exception as e:
            error_msg = f"Connection error: {e}"
            self.log_message("error", error_msg, is_error=True)

    def action_clear_log(self) -> None:
        self.log_widget.clear()
        self.message_history = []
        self.tokens_sent = 0
        self.tokens_received = 0
        
        # Re-show welcome message
        welcome_text = Text("🔄 Chat cleared. Ready for new conversation.", style="bold #00ff66")
        self.log_widget.write(welcome_text)

    def action_save_log(self) -> None:
        filename = f"astra_chat_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        filepath = os.path.join(SAVE_PATH, filename)
        try:
            # Export as plain text
            log_text = ""
            for msg in self.message_history:
                role_prefix = {
                    'user': 'You',
                    'assistant': 'Assistant',
                    'system': 'System',
                    'error': 'Error'
                }.get(msg['role'], msg['role'].capitalize())
                log_text += f"{msg['timestamp']} {role_prefix} >>> {msg['text']}\n\n"
            
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(log_text)
            self.log_message("system", f"💾 Chat saved to {filepath}")
        except Exception as e:
            self.log_message("error", f"Failed to save chat: {e}")

    def action_copy_last(self) -> None:
        if self.last_assistant_message:
            try:
                pyperclip.copy(self.last_assistant_message)
                self.log_message("system", "📋 Last assistant reply copied to clipboard")
            except Exception as e:
                self.log_message("error", f"Failed to copy to clipboard: {e}")
        else:
            self.log_message("system", "No assistant reply to copy", is_error=True)

    def action_copy_all(self) -> None:
        try:
            chat_text = ""
            for msg in self.message_history:
                role_prefix = {
                    'user': 'You',
                    'assistant': 'Assistant', 
                    'system': 'System',
                    'error': 'Error'
                }.get(msg['role'], msg['role'].capitalize())
                chat_text += f"{msg['timestamp']} {role_prefix} >>> {msg['text']}\n\n"
            
            pyperclip.copy(chat_text)
            self.log_message("system", "📋 Entire chat copied to clipboard")
        except Exception as e:
            self.log_message("error", f"Failed to copy to clipboard: {e}")

    def action_show_help(self) -> None:
        help_text = """🔧 AVAILABLE COMMANDS:
├ /help - Show this help message
├ /clear - Clear chat history
├ /stats - Show detailed statistics
└ /copy - Copy last assistant reply

⌨️ HOTKEYS:
├ Ctrl+C/Q - Quit application
├ Ctrl+L - Clear chat
├ Ctrl+S - Save chat to file
├ Ctrl+Y - Copy last assistant reply
├ Ctrl+A - Copy entire chat
├ F1 - Show this help
└ F2 - Show stats

🚀 Features:
├ Real-time streaming responses
├ Redis voice recognition support
├ BiDi text support (Arabic/Hebrew)
├ System monitoring
└ Token counting"""
        
        self.log_message("system", help_text)

    def action_show_stats(self) -> None:
        total_messages = len([m for m in self.message_history if m['role'] in ['user', 'assistant']])
        user_messages = len([m for m in self.message_history if m['role'] == 'user'])
        assistant_messages = len([m for m in self.message_history if m['role'] == 'assistant'])
        
        stats_text = f"""📊 DETAILED STATISTICS:

🎯 Session Info:
├ Agent ID: {self.agent_id}
├ User ID: {USER_ID}
└ Total Messages: {total_messages}

💬 Message Breakdown:
├ User Messages: {user_messages}
└ Assistant Messages: {assistant_messages}

📈 Token Usage:
├ Tokens Sent: {self.tokens_sent}
├ Tokens Received: {self.tokens_received}
└ Total Tokens: {self.tokens_sent + self.tokens_received}

💻 System Status:
├ CPU Usage: {self.cpu_usage:.1f}%
├ RAM Usage: {self.ram_usage:.1f}%
└ VRAM Usage: {self.vram_usage:.1f}%

🔗 Connection Status:
└ Redis: {self.redis_status}"""
        
        self.log_message("system", stats_text)

if __name__ == "__main__":
    # --- Configuration Loading Priority ---
    # 1. Start with a hardcoded default.
    default_agent_id = "default"

    # 2. Try to load from the central config file.
    try:
        # Path to the root directory's config file
        config_path = os.path.join(os.path.dirname(__file__), "..", ".astra_last_config.json")
        with open(config_path, "r") as f:
            config = json.load(f)
            # Update default if personality is in the config
            if 'personality' in config:
                default_agent_id = config['personality']
    except (FileNotFoundError, json.JSONDecodeError):
        # If the file doesn't exist or is invalid, we'll just use the default.
        pass
    except Exception as e:
        print(f"Warning: Could not read .astra_last_config.json: {e}")

    # 3. Allow environment variable to override the config file.
    default_agent_id = os.getenv("ASTRA_AGENT_ID", default_agent_id)

    # 4. Allow command-line argument to override everything.
    parser = argparse.ArgumentParser(description="🚀 Enhanced Astra CLI Client")
    parser.add_argument("--agent-id", default=default_agent_id,
                       help="The agent ID (personality) to use. Overrides config file and env var.")
    args = parser.parse_args()

    app = ChatApp(agent_id=args.agent_id)
    try:
        app.run()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")