"""Shell-free project checks and the final reviewed-change commit gate."""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys

from review_gate import current_review_status
from reuse_gate import enforce_reuse_baseline


def resolve_argv(argv: list[str], workdir: Path) -> list[str]:
    if argv[0] == "{python}":
        return [sys.executable, *argv[1:]]
    executable = argv[0]
    if Path(executable).is_absolute() or "/" in executable or "\\" in executable:
        candidate = Path(executable)
        resolved = candidate if candidate.is_absolute() else (workdir / candidate).resolve()
        if not resolved.is_file():
            raise OSError(f"找不到可执行文件：{executable}")
        return [str(resolved), *argv[1:]]
    resolved = shutil.which(executable)
    if not resolved:
        raise OSError(f"PATH 中找不到可执行文件：{executable}")
    return [resolved, *argv[1:]]


def run_pre_commit_checks(root: Path) -> tuple[bool, str]:
    config_path = root / ".codex" / "project-checks.json"
    if not config_path.is_file():
        return True, ""
    try:
        config = json.loads(config_path.read_text(encoding="utf-8-sig"))
        reuse_passed, reuse_detail = enforce_reuse_baseline(root, config.get("reuseBaseline"))
        if not reuse_passed:
            return False, reuse_detail
        checks = config.get("preCommitChecks", [])
        if not isinstance(checks, list):
            raise ValueError("preCommitChecks 必须是数组")
        for check in checks:
            if not isinstance(check, dict):
                raise ValueError("每项检查必须是对象")
            name = str(check.get("name") or "未命名检查")
            argv = check.get("argv")
            if not isinstance(argv, list) or not argv or not all(
                isinstance(item, str) and item for item in argv
            ):
                raise ValueError(f"{name} 的 argv 必须是非空字符串数组")
            workdir = (root / str(check.get("cwd") or ".")).resolve()
            workdir.relative_to(root)
            resolved_argv = resolve_argv(argv, workdir)
            timeout = int(check.get("timeoutSeconds", 300))
            result = subprocess.run(
                resolved_argv,
                cwd=workdir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=max(1, min(timeout, 900)),
                check=False,
            )
            if result.returncode != 0:
                output = (result.stdout + result.stderr).strip()[-6000:]
                return False, f"{name}未通过。\n{output or '命令返回非零状态。'}"
    except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired) as error:
        return False, f"提交前检查配置或执行失败：{error}"
    return True, ""


def enforce_commit_gate(root: Path) -> tuple[bool, str]:
    reviewed, reason, fingerprint = current_review_status(root)
    if not reviewed:
        return False, reason
    passed, detail = run_pre_commit_checks(root)
    if not passed:
        return False, detail
    still_reviewed, reason, after_fingerprint = current_review_status(root)
    if not still_reviewed or after_fingerprint != fingerprint:
        return False, reason or "提交前检查改变了 Git 工作树，请重新 review。"
    return True, ""
