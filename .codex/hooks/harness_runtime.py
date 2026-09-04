"""Deterministic runtime for the Hengxin Agent Harness hooks."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
from typing import Any

from commit_gate import enforce_commit_gate, run_pre_commit_checks
from review_gate import mark_review_needed, mark_reviewed, stop_gate
from security_utils import redact_prompt


FEEDBACK_PATTERN = re.compile(
    r"不是这样|不是这个意思|搞错(?:了)?|你错(?:了)?|又错(?:了)?|理解错(?:了)?|弄错(?:了)?|"
    r"这不对|完全不对|你漏(?:了)?|你忘(?:了)?|你没提|你没按|你没有按|不是让你|"
    r"没生效|没有生效|没执行|没有执行|我说过|说过了|提醒过|强调过|"
    r"我的意思是|我是说|你不应该|你不该"
)
CJK_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")


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
    return ""


def emit_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def detect_feedback_signal(event: dict[str, Any]) -> int:
    prompt = event.get("prompt")
    if not isinstance(prompt, str) or not FEEDBACK_PATTERN.search(prompt):
        return 0
    root = git_root(event)
    queue = root / ".codex" / "evolution" / "runtime" / "signals.jsonl"
    queue.parent.mkdir(parents=True, exist_ok=True)
    record = {"type": "correction", "prompt": redact_prompt(prompt)}
    with queue.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return 0


def check_evolution(event: dict[str, Any]) -> int:
    evolution = git_root(event) / ".codex" / "evolution" / "runtime"
    proposals = evolution / "proposals.md"
    signals = evolution / "signals.jsonl"
    messages: list[str] = []
    if proposals.is_file():
        pending = False
        count = 0
        for line in proposals.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith("## "):
                pending = line.strip() == "## 待审阅"
            elif pending and line.startswith("- "):
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


def is_git_commit_command(command: str) -> bool:
    for segment in re.split(r"(?:\r?\n|&&|\|\||(?<!\|)\|(?!\|)|;)", command):
        try:
            tokens = shlex.split(segment.strip(), posix=os.name != "nt")
        except ValueError:
            continue
        tokens = [token.strip("\"'") for token in tokens]
        if tokens and tokens[0] in {"&", "call"}:
            tokens = tokens[1:]
        if not tokens or Path(tokens[0]).name.lower() not in {"git", "git.exe"}:
            continue
        index = 1
        options_with_value = {
            "-C",
            "-c",
            "--config-env",
            "--exec-path",
            "--git-dir",
            "--namespace",
            "--super-prefix",
            "--work-tree",
        }
        while index < len(tokens) and tokens[index].startswith("-"):
            option = tokens[index].split("=", 1)[0]
            index += 2 if option in options_with_value and "=" not in tokens[index] else 1
        if index < len(tokens) and tokens[index] == "commit":
            return True
    return False


def is_git_init_command(command: str) -> bool:
    return bool(
        re.search(
            r"(?:^|[;&|\r\n])\s*(?:&\s*)?(?:git|git\.exe)\s+init(?:\s|$)",
            command,
            re.IGNORECASE,
        )
    )


def pre_tool_shell(event: dict[str, Any]) -> int:
    command = command_from(event)
    if is_git_init_command(command):
        emit_json({"decision": "block", "reason": "Harness 已有唯一 Git 根，禁止再次执行 git init。"})
        return 0
    if not is_git_commit_command(command):
        return 0
    passed, detail = enforce_commit_gate(git_root(event))
    if not passed:
        emit_json({"decision": "block", "reason": f"commit 被阻止。{detail}"})
    return 0


def pre_commit_gate(event: dict[str, Any]) -> int:
    passed, detail = enforce_commit_gate(git_root(event))
    if passed:
        return 0
    print(f"❌ commit 被阻止：{detail}", file=sys.stderr)
    return 1


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
            "❌ Git 提交标题必须包含汉字。允许 feat:、fix: 等类型前缀，"
            "例如：feat: 增加用户登录功能",
            file=sys.stderr,
        )
        return 1
    return 0


COMMANDS = {
    "check-evolution": check_evolution,
    "detect-feedback-signal": detect_feedback_signal,
    "mark-review-needed": mark_review_needed,
    "mark-reviewed": mark_reviewed,
    "pre-commit-gate": pre_commit_gate,
    "pre-tool-shell": pre_tool_shell,
    "stop-gate": stop_gate,
}


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "validate-commit-message":
        return validate_commit_message(sys.argv[2])
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        print(
            "usage: harness_runtime.py <hook-name> | validate-commit-message <message-file>",
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
