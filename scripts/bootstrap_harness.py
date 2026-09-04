#!/usr/bin/env python3
"""Initialize and verify a checkout of the Hengxin Agent Harness."""

from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import sys
import tomllib


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".codex/hooks"))

from review_gate import find_nested_git_metadata


REQUIRED_PATHS = (
    "AGENTS.md",
    ".agents/skills",
    ".codex/agents",
    ".codex/hooks.json",
    ".codex/hooks/harness_runtime.py",
    ".codex/hooks/commit_gate.py",
    ".codex/hooks/review_gate.py",
    ".codex/hooks/security_utils.py",
    ".githooks/commit-msg",
)


def run(*args: str, cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(args),
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def ensure_layout() -> None:
    missing = [item for item in REQUIRED_PATHS if not (ROOT / item).exists()]
    if missing:
        raise RuntimeError("Harness 文件不完整：" + ", ".join(missing))


def ensure_single_git_root(root: Path = ROOT) -> None:
    root = root.resolve()
    result = run("git", "rev-parse", "--show-toplevel", cwd=root)
    if result.returncode != 0:
        initialized = run("git", "init", cwd=root)
        if initialized.returncode != 0:
            raise RuntimeError(initialized.stderr.strip() or "git init 失败")
        result = run("git", "rev-parse", "--show-toplevel", cwd=root)
    git_root = Path(result.stdout.strip()).resolve()
    if git_root != root:
        raise RuntimeError(
            f"Harness 必须位于 Git 根目录。当前 Harness={root}，Git 根={git_root}。"
            "不要在 Harness 或产品子目录创建嵌套仓库。"
        )
    nested = find_nested_git_metadata(root)
    if nested:
        paths = ", ".join(str(path.relative_to(root)) for path in nested[:5])
        raise RuntimeError(f"检测到产品子目录中的嵌套 Git 元数据：{paths}")


def configure_git_hook() -> None:
    result = run("git", "config", "--local", "core.hooksPath", ".githooks")
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "无法配置 core.hooksPath")


def validate_configuration() -> None:
    json.loads((ROOT / ".codex/hooks.json").read_text(encoding="utf-8"))
    json.loads((ROOT / ".codex/project-checks.json").read_text(encoding="utf-8"))
    for agent in (ROOT / ".codex/agents").glob("*.toml"):
        data = tomllib.loads(agent.read_text(encoding="utf-8"))
        required = {"name", "description", "developer_instructions"}
        if not required.issubset(data):
            raise RuntimeError(f"Agent 配置缺字段：{agent}")
    names: set[str] = set()
    for skill in (ROOT / ".agents/skills").glob("*/SKILL.md"):
        content = skill.read_text(encoding="utf-8")
        name = re.search(r"(?m)^name:\s*(\S+)\s*$", content)
        description = re.search(r"(?m)^description:\s*(.+)$", content)
        if not content.startswith("---\n") or not name or not description:
            raise RuntimeError(f"Skill frontmatter 无效：{skill}")
        if name.group(1) in names:
            raise RuntimeError(f"Skill 名称重复：{name.group(1)}")
        names.add(name.group(1))


def initialize_local_state() -> None:
    evolution = ROOT / ".codex/evolution/runtime"
    evolution.mkdir(parents=True, exist_ok=True)
    signals = evolution / "signals.jsonl"
    proposals = evolution / "proposals.md"
    signals.touch(exist_ok=True)
    if not proposals.exists():
        template = ROOT / ".codex/evolution/proposals.example.md"
        proposals.write_text(template.read_text(encoding="utf-8"), encoding="utf-8")


def run_tests() -> None:
    result = run(
        sys.executable,
        "-X",
        "utf8",
        "-m",
        "unittest",
        "discover",
        "-s",
        "tests",
        "-v",
    )
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    if result.returncode != 0:
        raise RuntimeError("Harness 自动化测试失败")


def main() -> int:
    if sys.version_info < (3, 11):
        print("需要 Python 3.11 或更高版本。", file=sys.stderr)
        return 1
    try:
        ensure_layout()
        ensure_single_git_root()
        configure_git_hook()
        validate_configuration()
        initialize_local_state()
        run_tests()
    except Exception as error:
        print(f"Harness 初始化失败：{error}", file=sys.stderr)
        return 1
    print("\nHarness 初始化与验证通过。")
    print(f"Git 根目录：{ROOT}")
    print("下一步：在 Codex 输入 /hooks，审阅并信任本仓库 Hooks；然后始终从该根目录启动项目。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
