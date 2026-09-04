#!/usr/bin/env python3
"""Cross-platform command hooks for the Agent Harness Codex project."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any


FEEDBACK_PATTERN = re.compile(
    r"不是这样|不是这个意思|不应该|搞错|你错|又错|理解错|弄错|不合理|不通用|"
    r"不对劲|这不对|完全不对|去掉|删掉|删除|改成|换成|改为|不需要|没必要|"
    r"多余|你漏|漏掉|漏了|你忘|忘了|没提到|没有提到|你没提|少了|每次都|"
    r"怎么又|怎么还|我说过|说过了|提醒过|强调过|不是让你|没复用|你没按|"
    r"没生效|没有生效|没执行|不喜欢|不太喜欢|我的意思是|我是说|其实应该|"
    r"应该是|应该写"
)

CJK_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")

IGNORED_SUFFIXES = {
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".lock",
    ".log",
    ".env",
    ".gitignore",
    ".prettierrc",
    ".eslintrc",
}


def read_event() -> dict[str, Any]:
    raw = sys.stdin.buffer.read().decode("utf-8-sig", errors="replace")
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def git_root(event: dict[str, Any]) -> Path:
    cwd = event.get("cwd")
    start = Path(cwd) if isinstance(cwd, str) and cwd else Path.cwd()
    result = subprocess.run(
        ["git", "-C", str(start), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("当前目录不在 Git 仓库中")
    return Path(result.stdout.strip()).resolve()


def command_from(event: dict[str, Any]) -> str:
    tool_input = event.get("tool_input")
    if isinstance(tool_input, dict):
        command = tool_input.get("command")
        if isinstance(command, str):
            return command
    command = event.get("command")
    return command if isinstance(command, str) else ""


def emit_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def run_git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def detect_feedback_signal(event: dict[str, Any]) -> int:
    prompt = event.get("prompt")
    if not isinstance(prompt, str) or not prompt or not FEEDBACK_PATTERN.search(prompt):
        return 0

    root = git_root(event)
    queue = root / ".codex" / "evolution" / "signals.jsonl"
    queue.parent.mkdir(parents=True, exist_ok=True)
    record = json.dumps({"type": "correction", "prompt": prompt}, ensure_ascii=False)
    with queue.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(record + "\n")
    return 0


def check_evolution(event: dict[str, Any]) -> int:
    root = git_root(event)
    evolution = root / ".codex" / "evolution"
    proposals = evolution / "proposals.md"
    signals = evolution / "signals.jsonl"
    messages: list[str] = []

    if proposals.is_file():
        in_pending = False
        count = 0
        for line in proposals.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith("## "):
                in_pending = line.strip() == "## 待审阅"
                continue
            if in_pending and line.startswith("- "):
                count += 1
        if count:
            messages.append(f"📋 有 {count} 条进化建议待拍板，请逐条询问用户是否采纳。")

    if signals.is_file() and signals.stat().st_size > 0:
        messages.append("🔄 有新进化信号，请先派发 evolution-runner 消化，再逐条询问用户。")

    if messages:
        emit_json(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": " ".join(messages),
                }
            }
        )
    return 0


def find_tsconfig(root: Path) -> Path | None:
    excluded = {"node_modules", ".next", ".git", ".codex", ".agents"}
    for current, dirs, files in os.walk(root):
        current_path = Path(current)
        depth = len(current_path.relative_to(root).parts)
        dirs[:] = [name for name in dirs if name not in excluded and depth < 3]
        if "tsconfig.json" in files and depth <= 3:
            return current_path / "tsconfig.json"
    return None


def run_typescript_check(tsconfig: Path) -> tuple[int, str]:
    if os.name == "nt":
        argv = ["cmd.exe", "/d", "/s", "/c", "npx tsc --noEmit"]
    else:
        argv = ["npx", "tsc", "--noEmit"]
    try:
        result = subprocess.run(
            argv,
            cwd=tsconfig.parent,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=25,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return 1, f"TypeScript 检查无法执行：{error}"
    output = (result.stdout + result.stderr).strip()
    return result.returncode, output


def pids_on_windows_port(port: int) -> set[int]:
    result = subprocess.run(
        ["netstat", "-ano", "-p", "TCP"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    pids: set[int] = set()
    for line in result.stdout.splitlines():
        columns = line.split()
        if len(columns) >= 5 and columns[1].rsplit(":", 1)[-1] == str(port):
            try:
                pids.add(int(columns[-1]))
            except ValueError:
                pass
    return pids


def clear_dev_ports() -> None:
    ports = (3000, 3001, 4173, 5173, 8080)
    if os.name == "nt":
        for port in ports:
            for pid in pids_on_windows_port(port):
                if pid > 0:
                    subprocess.run(
                        ["taskkill", "/PID", str(pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        check=False,
                    )
        return

    lsof = shutil.which("lsof")
    if not lsof:
        return
    for port in ports:
        result = subprocess.run(
            [lsof, "-ti", f":{port}"],
            capture_output=True,
            text=True,
            check=False,
        )
        for raw_pid in result.stdout.split():
            if raw_pid.isdigit():
                subprocess.run(["kill", "-9", raw_pid], check=False)


def pre_tool_shell(event: dict[str, Any]) -> int:
    command = command_from(event)
    root = git_root(event)

    if re.search(r"\bgit\s+(?:[^\s]+\s+)*commit\b", command):
        tsconfig = find_tsconfig(root)
        if tsconfig:
            returncode, output = run_typescript_check(tsconfig)
            if returncode != 0:
                detail = output[-6000:] if output else "npx tsc --noEmit 返回非零状态。"
                emit_json(
                    {
                        "decision": "block",
                        "reason": f"编译检查未通过，commit 被阻止。\n{detail}",
                    }
                )
                return 0

    if re.search(r"\b(?:pnpm\s+dev|npm\s+run\s+dev|yarn\s+dev)\b", command):
        clear_dev_ports()
    return 0


def auto_push(event: dict[str, Any]) -> int:
    command = command_from(event)
    if not re.search(r"\bgit\s+(?:[^\s]+\s+)*commit\b", command):
        return 0

    root = git_root(event)
    branch_result = run_git(root, "symbolic-ref", "--quiet", "--short", "HEAD")
    if branch_result.returncode != 0:
        branch_result = run_git(root, "rev-parse", "--abbrev-ref", "HEAD")
    branch = branch_result.stdout.strip()
    if not branch:
        return 0
    if branch in {"main", "master"}:
        print(f"⚠️ 当前在 {branch} 分支，已跳过自动 push。保护分支需手动 push 或走 PR。", file=sys.stderr)
        return 0

    result = run_git(root, "push")
    if result.returncode != 0:
        detail = (result.stdout + result.stderr).strip()
        print(f"❌ 自动 push 失败，请手动检查：\n{detail}", file=sys.stderr)
    return 0


def patch_paths(command: str) -> list[str]:
    pattern = re.compile(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", re.MULTILINE)
    paths = [match.strip().strip('"') for match in pattern.findall(command)]
    move_pattern = re.compile(r"^\*\*\* Move to: (.+)$", re.MULTILINE)
    paths.extend(match.strip().strip('"') for match in move_pattern.findall(command))
    return paths


def is_code_path(raw_path: str, root: Path) -> bool:
    normalized = raw_path.replace("\\", "/")
    try:
        path = Path(raw_path)
        resolved = (path if path.is_absolute() else root / path).resolve()
        resolved.relative_to(root)
    except (OSError, ValueError):
        return False

    parts = {part.lower() for part in resolved.relative_to(root).parts}
    if parts.intersection({".git", ".codex", ".agents"}):
        return False
    if "/.git/" in f"/{normalized.lower().strip('/')}/":
        return False

    name = resolved.name.lower()
    suffix = resolved.suffix.lower()
    if suffix in IGNORED_SUFFIXES or name.startswith(".env"):
        return False
    return bool(suffix)


def mark_review_needed(event: dict[str, Any]) -> int:
    root = git_root(event)
    command = command_from(event)
    paths = patch_paths(command)
    if not any(is_code_path(path, root) for path in paths):
        return 0

    state = root / ".codex" / ".needs-review"
    state.write_text("needs_review\n", encoding="utf-8")
    return 0


def stop_gate(event: dict[str, Any]) -> int:
    root = git_root(event)
    state = root / ".codex" / ".needs-review"
    if not state.is_file():
        return 0

    value = state.read_text(encoding="utf-8-sig").strip()
    if value in {"", "clean"}:
        state.unlink(missing_ok=True)
        return 0

    emit_json(
        {
            "decision": "block",
            "reason": (
                "代码已修改但未通过 code review。请派发 code-reviewer 两阶段审查，"
                "通过后写入 clean。使用 Goal 自驱时，把 code-reviewer 通过写进完成条件。"
            ),
        }
    )
    return 0


def validate_commit_message(message_path: str) -> int:
    if message_path == "-":
        content = sys.stdin.buffer.read().decode("utf-8-sig", errors="replace")
    else:
        path = Path(message_path)
        if not path.is_file():
            print(f"❌ 找不到 Git 提交信息文件：{path}", file=sys.stderr)
            return 1
        content = path.read_text(encoding="utf-8-sig", errors="replace")

    subject = next(
        (
            line.strip()
            for line in content.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ),
        "",
    )
    if not subject:
        print("❌ Git 提交标题不能为空。", file=sys.stderr)
        return 1
    if not CJK_PATTERN.search(subject):
        print(
            "❌ Git 提交标题必须包含中文。允许 feat:、fix: 等类型前缀，"
            "例如：feat: 增加用户登录功能",
            file=sys.stderr,
        )
        return 1
    return 0


COMMANDS = {
    "detect-feedback-signal": detect_feedback_signal,
    "check-evolution": check_evolution,
    "pre-tool-shell": pre_tool_shell,
    "auto-push": auto_push,
    "mark-review-needed": mark_review_needed,
    "stop-gate": stop_gate,
}


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "validate-commit-message":
        return validate_commit_message(sys.argv[2])
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        print(
            "usage: harness_hook.py <hook-name> | "
            "validate-commit-message <message-file>",
            file=sys.stderr,
        )
        return 2
    event = read_event()
    try:
        return COMMANDS[sys.argv[1]](event)
    except Exception as error:
        print(f"Agent Harness hook {sys.argv[1]} failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
