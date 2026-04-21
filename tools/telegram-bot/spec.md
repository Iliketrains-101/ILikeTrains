# Telegram → Claude Code Pipeline Bot — Spec

## Purpose

Ship features and fix bugs from a phone. Send a natural language description
via Telegram; the bot writes a spec for approval, then implements it and
auto-pushes to GitHub, triggering a Vercel deploy.

---

## Workflow

```
1. User sends message  →  Claude infers bug or feature
2. Claude writes spec file  →  Bot sends spec for review
3. User replies "go"  →  Claude implements
4. Bot: git add + commit + push  →  Vercel auto-deploys
5. Bot confirms with commit hash + deploy URL
```

If the user replies with anything other than an approval word at step 3,
the bot treats it as revision feedback and asks Claude to update the spec.

---

## Architecture

```
Phone (Telegram app)
    ↕ Telegram Bot API (HTTPS polling)
Hetzner — bot.py (systemd service)
    ↕ subprocess: claude -p "..." --dangerously-skip-permissions
    ↕ subprocess: git add / commit / push
~/projects/<active-project>/
```

One-shot `claude -p` calls — no persistent Claude session between messages.

---

## Approval words

The bot recognises these as implementation approval (case-insensitive):
`yes`, `go`, `ok`, `yep`, `yup`, `sure`, `implement`, `ship`, `ship it`,
`looks good`, `good`, `do it`, `proceed`, `approved`, `approve`.

Anything else while in `awaiting_approval` state is treated as revision
feedback and passed back to Claude.

---

## Commands

| Telegram message | Bot behaviour |
|---|---|
| Any plain text (idle state) | Write spec, ask for approval |
| Any plain text (awaiting approval) | Revise spec with feedback |
| Approval word (awaiting approval) | Implement + push |
| `/start` | Greet, show active project |
| `/projects` | List all configured projects with active marker |
| `/use <name>` | Switch active project |
| `/status` | `git status --short` + last 5 commits |
| `/clear` | Reset state for active project (cancel pending spec) |
| `/help` | List commands |

---

## Spec file placement (Claude decides)

- **New feature** → `features/NNN-slug/spec.md` (next available number)
- **Bug on existing feature** → `features/NNN-existing/bug-slug.md`

Claude infers which from the natural language description and follows the
style of existing specs in `features/`.

Claude must output `FILE: <relative-path>` as the very last line of its
response so the bot knows which file was created.

---

## Git commit

After a successful implementation the bot runs:
```
git add -A
git commit -m "Implement: <spec-folder-name>\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## Project workspaces

Defined in `.env`:

```
PROJECTS=iliketrains:/root/projects/ILikeTrains,blog:/root/projects/Blog
VERCEL_URLS=iliketrains:https://iliketrains101.vercel.app
```

- Active project persisted to `~/.claude_tg_active_project`
- Per-project state in `~/.claude_tg_state/<name>.json`:
  `{ "status": "idle|awaiting_approval", "pending_path": "...", "pending_title": "..." }`
- `/use <name>` is case-insensitive

---

## Security

- Bot only responds to `ALLOWED_CHAT_ID` — all others silently ignored
- Token, chat ID, project map in `.env`, never in source

---

## Response handling

- Responses > 4096 chars split into multiple messages
- "Thinking…" placeholder message sent while Claude runs, deleted when done
- Every response prefixed with `[PROJECTNAME]`

---

## Setup on Hetzner

### Files
```
~/telegram-claude/
  bot.py
  .env
  requirements.txt
```

### `.env`
```
BOT_TOKEN=<from BotFather>
ALLOWED_CHAT_ID=<your Telegram user ID>
PROJECTS=iliketrains:/root/projects/ILikeTrains
VERCEL_URLS=iliketrains:https://iliketrains101.vercel.app
```

### `requirements.txt`
```
python-telegram-bot==21.*
python-dotenv
```

### systemd service (`/etc/systemd/system/claude-tg-bot.service`)
```ini
[Unit]
Description=Claude Code Telegram Bot
After=network.target

[Service]
User=root
WorkingDirectory=/root/telegram-claude
EnvironmentFile=/root/telegram-claude/.env
ExecStart=/usr/bin/python3 /root/telegram-claude/bot.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable claude-tg-bot
systemctl start claude-tg-bot
```

---

## Getting your Telegram chat ID
1. Message `@userinfobot` on Telegram — it replies with your user ID
2. Put that number in `.env` as `ALLOWED_CHAT_ID`

## Getting a bot token
1. Message `@BotFather` → `/newbot`
2. Copy the token into `.env`

---

## Limitations / out of scope
- No file uploads/downloads
- No multi-user support
- No conversation history between messages (each `claude -p` is fresh)
- Claude Code must be installed and `ANTHROPIC_API_KEY` set on Hetzner
