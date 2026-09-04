"""Deterministic boundary checks for a declared reusable frontend baseline."""

from __future__ import annotations

from fnmatch import fnmatchcase
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import subprocess
from typing import Any


def git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def relative_path(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"reuseBaseline.{field} 必须包含非空相对路径")
    normalized = PurePosixPath(value.replace("\\", "/"))
    windows_path = PureWindowsPath(value)
    if normalized.is_absolute() or windows_path.is_absolute() or windows_path.drive or ".." in normalized.parts:
        raise ValueError(f"reuseBaseline.{field} 只能使用仓库内相对路径：{value}")
    return normalized.as_posix().rstrip("/")


def string_list(config: dict[str, Any], field: str, required: bool = True) -> list[str]:
    raw = config.get(field)
    if raw is None and not required:
        return []
    if not isinstance(raw, list) or (required and not raw):
        raise ValueError(f"reuseBaseline.{field} 必须是非空字符串数组")
    if not all(isinstance(item, str) and item.strip() for item in raw):
        raise ValueError(f"reuseBaseline.{field} 必须是非空字符串数组")
    return [item.strip() for item in raw]


def is_within(path: str, roots: list[str]) -> bool:
    return any(path == root or path.startswith(root + "/") for root in roots)


def matches_entry_pattern(path: str, pattern: str) -> bool:
    if fnmatchcase(path, pattern):
        return True
    return pattern.startswith("**/") and fnmatchcase(path, pattern[3:])


def staged_added_paths(root: Path) -> list[str]:
    result = git(
        root,
        "diff",
        "--cached",
        "--no-renames",
        "--name-only",
        "--diff-filter=A",
        "-z",
    )
    if result.returncode != 0:
        raise OSError(result.stderr.strip() or "无法读取暂存区新增文件")
    return [item for item in result.stdout.split("\0") if item]


def index_has_path(root: Path, path: str) -> bool:
    return git(root, "cat-file", "-e", f":{path}").returncode == 0


def index_json(root: Path, path: str) -> dict[str, Any] | None:
    result = git(root, "show", f":{path}")
    if result.returncode != 0:
        return None
    value = json.loads(result.stdout)
    return value if isinstance(value, dict) else None


def is_frontend_manifest(root: Path, path: str, frontend_packages: set[str]) -> bool:
    if PurePosixPath(path).name != "package.json":
        return False
    manifest = index_json(root, path)
    if manifest is None:
        return False
    declared: set[str] = set()
    for field in ("dependencies", "devDependencies", "peerDependencies"):
        dependencies = manifest.get(field)
        if isinstance(dependencies, dict):
            declared.update(str(name) for name in dependencies)
    return bool(declared & frontend_packages)


def enforce_reuse_baseline(root: Path, raw_config: Any) -> tuple[bool, str]:
    if raw_config is None:
        return True, ""
    try:
        if not isinstance(raw_config, dict):
            raise ValueError("reuseBaseline 必须是对象")
        allowed_roots = [
            relative_path(item, "allowedFrontendRoots")
            for item in string_list(raw_config, "allowedFrontendRoots")
        ]
        protected_paths = [
            relative_path(item, "protectedPaths")
            for item in string_list(raw_config, "protectedPaths")
        ]
        patterns = [
            pattern.replace("\\", "/")
            for pattern in string_list(raw_config, "parallelEntryPatterns", required=False)
        ]
        frontend_packages = set(string_list(raw_config, "frontendPackages"))

        missing = [path for path in protected_paths if not index_has_path(root, path)]
        if missing:
            return False, "母版关键路径缺失或将被删除：" + ", ".join(missing)

        violations: list[str] = []
        for path in staged_added_paths(root):
            if is_within(path, allowed_roots):
                continue
            if is_frontend_manifest(root, path, frontend_packages) or any(
                matches_entry_pattern(path, pattern) for pattern in patterns
            ):
                violations.append(path)
        if violations:
            return False, "检测到允许根之外的平行前端根或入口：" + ", ".join(violations)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return False, f"复用母版门禁配置或执行失败：{error}"
    return True, ""
