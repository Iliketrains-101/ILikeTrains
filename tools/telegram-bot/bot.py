#!/usr/bin/env python3
"""
Telegram → Claude Code pipeline bot.

Workflow:
  user message → Claude writes spec → user approves → Claude implements
  → git push → Vercel deploys
"""

import asyncio
import json
import os
import re
import subprocess
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

load_dotenv()

BOT_TOKEN       = os.environ["BOT_TOKEN"]
ALLOWED_CHAT_ID = int(os.environ["ALLOWED_CHAT_ID"])
PROJECTS_RAW    = os.environ["PROJECTS"]
VERCEL_URLS_RAW = os.environ.get("VERCEL_URLS", "")

# Parse PROJECTS=name:path,name:path
PROJECTS: dict[str, Path] = {}
for entry in PROJECTS_RAW.split(","):
    name, path = entry.strip().split(":", 1)
    PROJECTS[name.strip().lower()] = Path(path.strip())

# Parse VERCEL_URLS=name:url,name:url
VERCEL_URLS: dict[str, str] = {}
for entry in VERCEL_URLS_RAW.split(","):
    if ":" not in entry:
        continue
    name, url = entry.strip().split(":", 1)
    VERCEL_URLS[name.strip().lower()] = url.strip()

ACTIVE_PROJECT_FILE = Path.home() / ".claude_tg_active_project"
STATE_DIR           = Path.home() / ".claude_tg_state"
STATE_DIR.mkdir(exist_ok=True)

APPROVAL_WORDS = {
    "yes", "go", "ok", "yep", "yup", "sure", "implement", "ship",
    "ship it", "looks good", "good", "do it", "proceed", "approved", "approve",
}


# ── Project / state helpers ───────────────────────────────────────────────────

def get_active_project() -> str:
    if ACTIVE_PROJECT_FILE.exists():
        name = ACTIVE_PROJECT_FILE.read_text().strip().lower()
        if name in PROJECTS:
            return name
    return next(iter(PROJECTS))


def set_active_project(name: str) -> None:
    ACTIVE_PROJECT_FILE.write_text(name)


def load_state(project: str) -> dict:
    f = STATE_DIR / f"{project}.json"
    if f.exists():
        return json.loads(f.read_text())
    return {"status": "idle", "pending_path": None, "pending_title": None}


def save_state(project: str, state: dict) -> None:
    (STATE_DIR / f"{project}.json").write_text(json.dumps(state, indent=2))


def label(project: str) -> str:
    return f"[{project.upper()}]"


def is_approval(text: str) -> bool:
    return text.strip().lower() in APPROVAL_WORDS


# ── Subprocess helpers ────────────────────────────────────────────────────────

def run_claude(cwd: Path, prompt: str, timeout: int = 600) -> str:
    result = subprocess.run(
        ["claude", "-p", prompt, "--dangerously-skip-permissions"],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return (result.stdout + result.stderr).strip()


def run_git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    return (result.stdout + result.stderr).strip()


def extract_file_path(claude_output: str, cwd: Path) -> Path | None:
    match = re.search(r"^FILE:\s*(.+)$", claude_output, re.MULTILINE)
    if not match:
        return None
    return cwd / match.group(1).strip()


# ── Telegram helpers ──────────────────────────────────────────────────────────

def allowed(update: Update) -> bool:
    return update.effective_chat.id == ALLOWED_CHAT_ID


async def send_long(update: Update, text: str, prefix: str = "") -> None:
    full = f"{prefix}\n{text}" if prefix else text
    for i in range(0, max(len(full), 1), 4096):
        await update.message.reply_text(full[i:i + 4096])


# ── Command handlers ──────────────────────────────────────────────────────────

async def cmd_start(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        return
    proj = get_active_project()
    await update.message.reply_text(
        f"Claude Code pipeline bot ready.\n"
        f"Active: *{proj}*  |  Projects: {', '.join(PROJECTS)}\n\n"
        f"Describe a feature or bug to get started.",
        parse_mode="Markdown",
    )


async def cmd_projects(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        return
    proj = get_active_project()
    lines = [f"{'→' if k == proj else '  '} {k}  {v}" for k, v in PROJECTS.items()]
    await update.message.reply_text("\n".join(lines))


async def cmd_use(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        return
    if not ctx.args:
        await update.message.reply_text("Usage: /use <project-name>")
        return
    name = ctx.args[0].strip().lower()
    if name not in PROJECTS:
        await update.message.reply_text(f"Unknown project '{name}'. Available: {', '.join(PROJECTS)}")
        return
    set_active_project(name)
    await update.message.reply_text(f"Switched to {label(name)}")


async def cmd_status(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        return
    proj = get_active_project()
    cwd  = PROJECTS[proj]
    status = run_git(cwd, "status", "--short")
    log    = run_git(cwd, "log", "--oneline", "-5")
    await update.message.reply_text(
        f"{label(proj)}\n```\n{status or '(clean)'}\n\nRecent commits:\n{log}\n```",
        parse_mode="Markdown",
    )


async def cmd_clear(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        return
    proj = get_active_project()
    save_state(proj, {"status": "idle", "pending_path": None, "pending_title": None})
    await update.message.reply_text(f"{label(proj)} State cleared — any pending spec cancelled.")


async def cmd_help(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        return
    await update.message.reply_text(
        "/projects — list projects\n"
        "/use <name> — switch active project\n"
        "/status — git status + recent commits\n"
        "/clear — cancel pending spec / reset state\n"
        "/help — this message\n\n"
        "Send any message to start a feature or bug request.\n"
        "Reply 'go' (or 'yes', 'ship it', etc.) to approve a spec and trigger implementation.\n"
        "Reply anything else to revise the spec."
    )


# ── Main message handler ──────────────────────────────────────────────────────

async def on_message(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        return

    proj  = get_active_project()
    cwd   = PROJECTS[proj]
    lbl   = label(proj)
    text  = update.message.text.strip()
    state = load_state(proj)

    if state["status"] == "awaiting_approval":
        if is_approval(text):
            await _implement(update, proj, cwd, lbl, state)
        else:
            await _revise_spec(update, proj, cwd, lbl, text, state)
    else:
        await _write_spec(update, proj, cwd, lbl, text)


async def _write_spec(
    update: Update, proj: str, cwd: Path, lbl: str, user_request: str
) -> None:
    thinking = await update.message.reply_text(f"{lbl} Writing spec…")

    prompt = (
        f'The user wants the following change to the codebase: "{user_request}"\n\n'
        f"1. Determine whether this is a bug report or a new feature request.\n"
        f"2. Choose the right file location:\n"
        f"   - New feature → features/NNN-slug/spec.md (find the next unused number from existing dirs)\n"
        f"   - Bug on an existing feature → features/NNN-existing-slug/bug-short-description.md\n"
        f"3. Write a clear, concise spec that matches the style of existing specs in features/.\n"
        f"4. Create the file on disk.\n"
        f"5. On the very last line of your response write exactly: FILE: <relative-path-to-file>"
    )

    try:
        out = await asyncio.to_thread(run_claude, cwd, prompt, 180)
    except subprocess.TimeoutExpired:
        await thinking.edit_text(f"{lbl} Claude timed out writing spec.")
        return

    spec_path = extract_file_path(out, cwd)
    if not (spec_path and spec_path.exists()):
        await thinking.edit_text(f"{lbl} Couldn't write spec.\n\n{out[:500]}")
        return

    content = spec_path.read_text()
    rel     = str(spec_path.relative_to(cwd))
    title   = spec_path.parent.name

    save_state(proj, {
        "status":        "awaiting_approval",
        "pending_path":  rel,
        "pending_title": f"Implement: {title}",
    })

    await thinking.delete()
    await send_long(update, content, prefix=f"{lbl} Here's the spec (`{rel}`):")
    await update.message.reply_text("Reply 'go' to implement, or tell me what to change.")


async def _revise_spec(
    update: Update, proj: str, cwd: Path, lbl: str, feedback: str, state: dict
) -> None:
    thinking = await update.message.reply_text(f"{lbl} Revising spec…")

    prompt = (
        f'The spec at {state["pending_path"]} needs revision.\n'
        f'User feedback: "{feedback}"\n\n'
        f"Update the spec file to reflect this feedback.\n"
        f"On the very last line of your response write exactly: FILE: <relative-path-to-file>"
    )

    try:
        out = await asyncio.to_thread(run_claude, cwd, prompt, 120)
    except subprocess.TimeoutExpired:
        await thinking.edit_text(f"{lbl} Claude timed out.")
        return

    spec_path = extract_file_path(out, cwd)
    if spec_path and spec_path.exists():
        content = spec_path.read_text()
        state["pending_path"] = str(spec_path.relative_to(cwd))
        save_state(proj, state)
        await thinking.delete()
        await send_long(update, content, prefix=f"{lbl} Revised spec:")
        await update.message.reply_text("Reply 'go' to implement, or keep refining.")
    else:
        await thinking.edit_text(f"{lbl} Couldn't parse revised spec.\n\n{out[:500]}")


async def _implement(
    update: Update, proj: str, cwd: Path, lbl: str, state: dict
) -> None:
    thinking = await update.message.reply_text(f"{lbl} Implementing…")

    prompt = (
        f"Implement the spec at {state['pending_path']}.\n"
        f"When done, run `npm run build` to verify it compiles without errors.\n"
        f"Do not run git — the bot handles that."
    )

    try:
        out = await asyncio.to_thread(run_claude, cwd, prompt, 600)
    except subprocess.TimeoutExpired:
        await thinking.edit_text(f"{lbl} Claude timed out during implementation.")
        return

    # Commit and push
    title = state.get("pending_title") or "Implement spec"
    run_git(cwd, "add", "-A")
    run_git(
        cwd, "commit", "-m",
        f"{title}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>",
    )
    run_git(cwd, "push", "origin", "main")
    commit_hash = run_git(cwd, "rev-parse", "--short", "HEAD")

    save_state(proj, {"status": "idle", "pending_path": None, "pending_title": None})

    await thinking.delete()
    await send_long(update, out, prefix=f"{lbl} Done!")

    deploy_url = VERCEL_URLS.get(proj, "")
    footer = f"Pushed `{commit_hash}` → GitHub"
    if deploy_url:
        footer += f"\nVercel deploying → {deploy_url}"
    await update.message.reply_text(footer, parse_mode="Markdown")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start",    cmd_start))
    app.add_handler(CommandHandler("projects", cmd_projects))
    app.add_handler(CommandHandler("use",      cmd_use))
    app.add_handler(CommandHandler("status",   cmd_status))
    app.add_handler(CommandHandler("clear",    cmd_clear))
    app.add_handler(CommandHandler("help",     cmd_help))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_message))

    print("Bot started. Polling…")
    app.run_polling()


if __name__ == "__main__":
    main()
