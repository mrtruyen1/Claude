#!/usr/bin/env python3
"""
Telegram bot - điều khiển Claude API và chạy lệnh shell trên server.
Cấu hình qua biến môi trường (xem .env.example).
"""

import asyncio
import logging
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime

from anthropic import Anthropic
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ── Cấu hình ──────────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")
MAX_HISTORY = int(os.environ.get("MAX_HISTORY_TURNS", "20"))

# Chat ID (số nguyên) được phép dùng bot, cách nhau bởi dấu phẩy
_raw_ids = os.environ.get("ALLOWED_CHAT_IDS", "")
ALLOWED_IDS: set[int] = {int(x.strip()) for x in _raw_ids.split(",") if x.strip()}

# Lệnh shell được phép chạy (prefix whitelist). Để trống = không giới hạn.
# Ví dụ: "systemctl,df,free,uptime,docker,ls,cat,journalctl"
_raw_cmds = os.environ.get("ALLOWED_COMMANDS", "systemctl,df,free,uptime,docker,ls,journalctl,ping,ip,cat,tail,grep,ps,top,htop")
ALLOWED_CMD_PREFIXES: list[str] = [c.strip() for c in _raw_cmds.split(",") if c.strip()]

SHELL_TIMEOUT = int(os.environ.get("SHELL_TIMEOUT_SEC", "30"))

anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)

# Lưu lịch sử hội thoại theo chat_id: list[{"role": ..., "content": ...}]
conversation_history: dict[int, list[dict]] = defaultdict(list)


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_allowed(update: Update) -> bool:
    if not ALLOWED_IDS:
        return True
    chat_id = update.effective_chat.id
    return chat_id in ALLOWED_IDS


def _cmd_allowed(command: str) -> bool:
    if not ALLOWED_CMD_PREFIXES:
        return True
    first_token = command.strip().split()[0] if command.strip() else ""
    return any(first_token == p or first_token.startswith(p + " ") for p in ALLOWED_CMD_PREFIXES)


async def run_shell(command: str) -> str:
    """Chạy lệnh shell, trả về stdout+stderr dạng string."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=SHELL_TIMEOUT,
        )
        out = result.stdout.strip()
        err = result.stderr.strip()
        combined = "\n".join(filter(None, [out, err]))
        return combined if combined else "(không có output)"
    except subprocess.TimeoutExpired:
        return f"Timeout sau {SHELL_TIMEOUT}s"
    except Exception as exc:
        return f"Lỗi: {exc}"


async def ask_claude(chat_id: int, user_message: str) -> str:
    """Gửi message đến Claude, kèm lịch sử hội thoại, trả về response."""
    history = conversation_history[chat_id]
    history.append({"role": "user", "content": user_message})

    # Giữ tối đa MAX_HISTORY lượt (mỗi lượt = 2 message)
    if len(history) > MAX_HISTORY * 2:
        history[:] = history[-(MAX_HISTORY * 2):]

    response = anthropic_client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        system=(
            "Bạn là trợ lý AI thông minh tên Claude, đang hoạt động qua Telegram bot. "
            "Trả lời ngắn gọn, rõ ràng. Dùng tiếng Việt nếu người dùng hỏi tiếng Việt."
        ),
        messages=history,
    )
    assistant_message = response.content[0].text
    history.append({"role": "assistant", "content": assistant_message})
    return assistant_message


def _escape_md(text: str) -> str:
    """Escape ký tự đặc biệt cho MarkdownV2."""
    special = r"\_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{c}" if c in special else c for c in text)


async def safe_reply(update: Update, text: str, parse_mode: str | None = None) -> None:
    """Gửi reply, tự động cắt nếu quá 4096 ký tự."""
    max_len = 4096
    for i in range(0, len(text), max_len):
        await update.message.reply_text(text[i : i + max_len], parse_mode=parse_mode)


# ── Command handlers ──────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_allowed(update):
        await update.message.reply_text("Bạn không có quyền dùng bot này.")
        return
    chat_id = update.effective_chat.id
    await update.message.reply_text(
        f"Xin chào! Chat ID của bạn: `{chat_id}`\n\n"
        "Các lệnh:\n"
        "/ask <câu hỏi> — hỏi Claude\n"
        "/run <lệnh> — chạy lệnh shell\n"
        "/reset — xóa lịch sử hội thoại\n"
        "/status — trạng thái hệ thống\n"
        "/help — hướng dẫn\n\n"
        "Hoặc nhắn tin trực tiếp để chat với Claude.",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_allowed(update):
        return
    allowed_cmds = ", ".join(ALLOWED_CMD_PREFIXES) if ALLOWED_CMD_PREFIXES else "tất cả"
    await update.message.reply_text(
        "*Hướng dẫn sử dụng:*\n\n"
        "💬 *Chat với Claude:*\n"
        "  Nhắn tin bình thường hoặc dùng `/ask <nội dung>`\n\n"
        "⚡ *Chạy lệnh shell:*\n"
        "  `/run <lệnh>` — ví dụ: `/run df -h`\n"
        f"  Lệnh được phép: `{allowed_cmds}`\n\n"
        "🔄 *Quản lý:*\n"
        "  `/reset` — xóa lịch sử chat với Claude\n"
        "  `/status` — xem RAM, disk, uptime\n",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_ask(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_allowed(update):
        await update.message.reply_text("Bạn không có quyền dùng bot này.")
        return
    prompt = " ".join(context.args).strip()
    if not prompt:
        await update.message.reply_text("Cách dùng: /ask <câu hỏi>")
        return
    chat_id = update.effective_chat.id
    await update.message.reply_text("Đang xử lý...")
    try:
        reply = await ask_claude(chat_id, prompt)
        await safe_reply(update, reply)
    except Exception as exc:
        logger.error("Claude API error: %s", exc)
        await update.message.reply_text(f"Lỗi khi gọi Claude API:\n{exc}")


async def cmd_run(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_allowed(update):
        await update.message.reply_text("Bạn không có quyền dùng bot này.")
        return
    command = " ".join(context.args).strip()
    if not command:
        await update.message.reply_text("Cách dùng: /run <lệnh shell>")
        return
    if not _cmd_allowed(command):
        first = command.split()[0]
        await update.message.reply_text(
            f"Lệnh `{first}` không được phép.\n"
            f"Danh sách cho phép: {', '.join(ALLOWED_CMD_PREFIXES)}",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    logger.info("Chạy lệnh từ chat %d: %s", update.effective_chat.id, command)
    await update.message.reply_text(f"Đang chạy: `{command}`", parse_mode=ParseMode.MARKDOWN)
    output = await run_shell(command)
    await safe_reply(update, f"```\n{output}\n```", parse_mode=ParseMode.MARKDOWN)


async def cmd_reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_allowed(update):
        return
    chat_id = update.effective_chat.id
    conversation_history[chat_id].clear()
    await update.message.reply_text("Đã xóa lịch sử hội thoại.")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_allowed(update):
        return
    await update.message.reply_text("Đang lấy thông tin hệ thống...")
    parts = {}
    parts["uptime"] = await run_shell("uptime -p")
    parts["memory"] = await run_shell("free -h | head -2")
    parts["disk"] = await run_shell("df -h / | tail -1")
    parts["load"] = await run_shell("cat /proc/loadavg")

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    text = (
        f"*Trạng thái hệ thống* ({now})\n\n"
        f"⏱ Uptime: `{parts['uptime']}`\n"
        f"💾 RAM:\n```\n{parts['memory']}\n```\n"
        f"💿 Disk /:\n`{parts['disk']}`\n"
        f"📊 Load: `{parts['load']}`"
    )
    await safe_reply(update, text, parse_mode=ParseMode.MARKDOWN)


# ── Message handler (chat tự do với Claude) ───────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_allowed(update):
        return
    text = update.message.text.strip()
    if not text:
        return
    chat_id = update.effective_chat.id
    try:
        reply = await ask_claude(chat_id, text)
        await safe_reply(update, reply)
    except Exception as exc:
        logger.error("Claude error: %s", exc)
        await update.message.reply_text(f"Lỗi: {exc}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    logger.info("Khởi động bot (model: %s)", CLAUDE_MODEL)
    if ALLOWED_IDS:
        logger.info("Whitelist chat IDs: %s", ALLOWED_IDS)
    else:
        logger.warning("Không có whitelist — mọi người đều dùng được bot!")

    app = Application.builder().token(TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("ask", cmd_ask))
    app.add_handler(CommandHandler("run", cmd_run))
    app.add_handler(CommandHandler("reset", cmd_reset))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
