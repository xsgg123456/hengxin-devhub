from __future__ import annotations

import ast
import json
from pathlib import Path
import re
import sys
import tempfile
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import bootstrap_harness


class HarnessConfigurationTests(unittest.TestCase):
    def test_all_python_json_toml_and_shell_entrypoints_are_valid(self) -> None:
        for path in ROOT.rglob("*.py"):
            if ".git" not in path.parts:
                ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
                self.assertLessEqual(
                    len(path.read_text(encoding="utf-8").splitlines()),
                    300,
                    str(path),
                )
        json.loads((ROOT / ".codex/hooks.json").read_text(encoding="utf-8"))
        json.loads((ROOT / ".codex/project-checks.json").read_text(encoding="utf-8"))
        for path in (ROOT / ".codex/agents").glob("*.toml"):
            tomllib.loads(path.read_text(encoding="utf-8"))
        bootstrap_harness.validate_configuration()

    def test_hook_config_has_no_implicit_push_or_port_kill(self) -> None:
        hooks = (ROOT / ".codex/hooks.json").read_text(encoding="utf-8")
        runtime = (ROOT / ".codex/hooks/harness_runtime.py").read_text(encoding="utf-8")
        self.assertNotIn("auto-push", hooks)
        self.assertNotRegex(runtime, r"taskkill|kill\s+-9|clear_dev_ports|git[^\n]+push")
        self.assertIn('"matcher": "Bash|apply_patch|Write|Edit"', hooks)

    def test_runtime_state_is_ignored_and_templates_are_tracked(self) -> None:
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn(".codex/evolution/runtime/", ignore)
        self.assertTrue((ROOT / ".codex/evolution/signals.example.jsonl").exists())
        self.assertTrue((ROOT / ".codex/evolution/proposals.example.md").exists())
        self.assertFalse((ROOT / ".codex/evolution/signals.jsonl").exists())
        self.assertFalse((ROOT / ".codex/evolution/proposals.md").exists())

    def test_skills_have_unique_frontmatter_and_no_dead_guideline(self) -> None:
        names: list[str] = []
        for path in (ROOT / ".agents/skills").glob("*/SKILL.md"):
            content = path.read_text(encoding="utf-8")
            name = re.search(r"(?m)^name:\s*(\S+)\s*$", content)
            description = re.search(r"(?m)^description:\s*(.+)$", content)
            self.assertIsNotNone(name, str(path))
            self.assertIsNotNone(description, str(path))
            names.append(name.group(1))
        self.assertEqual(len(names), len(set(names)))
        skill_builder = (
            ROOT / ".agents/skills/skill-builder/SKILL.md"
        ).read_text(encoding="utf-8")
        self.assertNotIn("Agent-Guideline.md", skill_builder)
        self.assertNotIn("[可用技能]", skill_builder)

    def test_docs_enforce_one_repository_root(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        builder = (ROOT / ".agents/skills/dev-builder/SKILL.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("单仓库根", agents)
        self.assertIn("产品子目录严禁 git init", builder)
        self.assertNotIn("push 由 hook 处理", builder)

    def test_bootstrap_rejects_harness_below_an_existing_git_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            child = parent / "harness"
            child.mkdir()
            result = bootstrap_harness.run("git", "init", cwd=parent)
            self.assertEqual(result.returncode, 0, result.stderr)
            with self.assertRaisesRegex(RuntimeError, "Git 根目录"):
                bootstrap_harness.ensure_single_git_root(child)

    def test_bootstrap_rejects_nested_product_repository(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            product = root / "product"
            product.mkdir()
            self.assertEqual(bootstrap_harness.run("git", "init", cwd=root).returncode, 0)
            self.assertEqual(bootstrap_harness.run("git", "init", cwd=product).returncode, 0)
            with self.assertRaisesRegex(RuntimeError, "嵌套 Git"):
                bootstrap_harness.ensure_single_git_root(root)

    def test_env_example_is_not_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".gitignore").write_text(
                (ROOT / ".gitignore").read_text(encoding="utf-8"), encoding="utf-8"
            )
            example = root / "product" / ".env.example"
            example.parent.mkdir()
            example.write_text("KEY=\n", encoding="utf-8")
            self.assertEqual(bootstrap_harness.run("git", "init", cwd=root).returncode, 0)
            result = bootstrap_harness.run(
                "git", "check-ignore", "-q", str(example), cwd=root
            )
            self.assertEqual(result.returncode, 1, result.stderr)


if __name__ == "__main__":
    unittest.main()
