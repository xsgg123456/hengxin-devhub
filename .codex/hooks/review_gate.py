"""Git-diff based code-review state for Harness lifecycle hooks."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any


RUNTIME_PATHS = {
    ".codex/.needs-review",
    ".codex/.review-state.json",
}
PLANNING_FILES = {
    "design-brief.md",
    "dev-plan.md",
    "product-spec-changelog.md",
    "product-spec.md",
}
STATE_VERSION = 1
SCAN_PRUNE_DIRS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
}


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


def git_root(event: dict[str, Any]) -> Path:
    cwd = event.get("cwd")
    start = Path(cwd) if isinstance(cwd, str) and cwd else Path.cwd()
    result = run_git(start, "rev-parse", "--show-toplevel")
    if result.returncode != 0:
        raise RuntimeError("当前目录不在 Git 仓库中")
    return Path(result.stdout.strip()).resolve()


def git_status_entries(root: Path) -> list[tuple[str, str]]:
    result = run_git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "无法读取 Git 状态")
    records = result.stdout.split("\0")
    entries: list[tuple[str, str]] = []
    index = 0
    while index < len(records):
        record = records[index]
        index += 1
        if not record:
            continue
        status = record[:2]
        entries.append((status, record[3:]))
        if "R" in status or "C" in status:
            if index < len(records) and records[index]:
                entries.append((status, records[index]))
                index += 1
    return entries


def find_nested_git_metadata(root: Path) -> list[Path]:
    root = root.resolve()
    found: list[Path] = []
    for current, dirnames, filenames in os.walk(root):
        current_path = Path(current)
        if current_path != root and ".git" in dirnames:
            found.append((current_path / ".git").resolve())
        if current_path != root and ".git" in filenames:
            found.append((current_path / ".git").resolve())
        dirnames[:] = [name for name in dirnames if name not in SCAN_PRUNE_DIRS]
    return sorted(set(found))


def is_review_relevant(raw_path: str) -> bool:
    normalized = raw_path.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    lowered = normalized.lower()
    if (
        lowered.startswith(".git/")
        or lowered.startswith(".codex/evolution/runtime/")
        or lowered in RUNTIME_PATHS
    ):
        return False
    if "/" not in lowered and lowered in PLANNING_FILES:
        return False
    return bool(normalized)


def review_fingerprint(root: Path) -> str | None:
    entries = sorted(
        (status, path)
        for status, path in git_status_entries(root)
        if is_review_relevant(path)
    )
    if not entries:
        return None
    digest = hashlib.sha256()
    for status, path in entries:
        digest.update(status.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.encode("utf-8", errors="surrogateescape"))
        digest.update(b"\0")
        candidate = (root / path).resolve()
        try:
            candidate.relative_to(root)
            if candidate.is_file():
                digest.update(candidate.read_bytes())
        except (OSError, ValueError):
            digest.update(b"[UNREADABLE]")
        digest.update(b"\0")
    return digest.hexdigest()


def state_path(root: Path) -> Path:
    return root / ".codex" / ".review-state.json"


def read_review_state(root: Path) -> dict[str, Any]:
    try:
        value = json.loads(state_path(root).read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def write_review_state(root: Path, status: str, fingerprint: str) -> None:
    path = state_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": STATE_VERSION, "status": status, "fingerprint": fingerprint}
    path.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    (root / ".codex" / ".needs-review").unlink(missing_ok=True)


def clear_review_state(root: Path) -> None:
    state_path(root).unlink(missing_ok=True)
    (root / ".codex" / ".needs-review").unlink(missing_ok=True)


def current_review_status(root: Path) -> tuple[bool, str, str | None]:
    nested = find_nested_git_metadata(root)
    if nested:
        paths = ", ".join(str(path.relative_to(root)) for path in nested[:5])
        return False, f"检测到嵌套 Git 元数据：{paths}", None
    fingerprint = review_fingerprint(root)
    if fingerprint is None:
        return True, "", None
    state = read_review_state(root)
    if state.get("status") != "reviewed" or state.get("fingerprint") != fingerprint:
        return False, "当前 Git 变更尚未通过两阶段 code review，或 review 后又发生变化。", fingerprint
    return True, "", fingerprint


def mark_review_needed(event: dict[str, Any]) -> int:
    root = git_root(event)
    fingerprint = review_fingerprint(root)
    if fingerprint is None:
        clear_review_state(root)
        return 0
    state = read_review_state(root)
    if state.get("status") == "reviewed" and state.get("fingerprint") == fingerprint:
        return 0
    write_review_state(root, "pending", fingerprint)
    return 0


def mark_reviewed(event: dict[str, Any]) -> int:
    root = git_root(event)
    nested = find_nested_git_metadata(root)
    if nested:
        paths = ", ".join(str(path.relative_to(root)) for path in nested[:5])
        print(f"无法记录 review：检测到嵌套 Git 元数据：{paths}", file=sys.stderr)
        return 1
    fingerprint = review_fingerprint(root)
    if fingerprint is None:
        clear_review_state(root)
        print("当前没有需要记录的 Git 变更。")
        return 0
    write_review_state(root, "reviewed", fingerprint)
    print(f"已记录 review 指纹：{fingerprint[:12]}")
    return 0


def stop_gate(event: dict[str, Any]) -> int:
    root = git_root(event)
    nested = find_nested_git_metadata(root)
    if nested:
        paths = ", ".join(str(path.relative_to(root)) for path in nested[:5])
        reason = f"检测到被禁止的嵌套 Git 元数据：{paths}。请移除嵌套仓库后重新审查。"
        if event.get("stop_hook_active") is True:
            emit_json({"systemMessage": reason + " 已停止自动续跑。"})
            return 0
        emit_json({"decision": "block", "reason": reason})
        return 0
    fingerprint = review_fingerprint(root)
    if fingerprint is None:
        clear_review_state(root)
        return 0
    state = read_review_state(root)
    if state.get("status") == "reviewed" and state.get("fingerprint") == fingerprint:
        return 0
    write_review_state(root, "pending", fingerprint)
    reason = (
        "检测到尚未通过 code review 的 Git 变更。请派发 code-reviewer 两阶段审查；"
        "通过后执行 python -X utf8 .codex/hooks/harness_runtime.py mark-reviewed。"
    )
    if event.get("stop_hook_active") is True:
        emit_json({"systemMessage": reason + " 已停止自动续跑，review 状态仍保留。"})
        return 0
    emit_json({"decision": "block", "reason": reason})
    return 0
