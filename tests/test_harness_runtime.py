from __future__ import annotations

import contextlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


HOOKS = Path(__file__).resolve().parents[1] / ".codex" / "hooks"
REPO_ROOT = HOOKS.parents[1]
sys.path.insert(0, str(HOOKS))

import harness_runtime as runtime
import review_gate


class TemporaryGitRepository(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="hengxin-harness-test-")
        self.root = Path(self.temporary.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Harness Test")
        self.git("config", "user.email", "harness@example.invalid")
        (self.root / ".gitignore").write_text(
            ".codex/.review-state.json\n"
            ".codex/.needs-review\n"
            ".codex/evolution/runtime/\n",
            encoding="utf-8",
        )
        self.git("add", ".gitignore")
        self.git("commit", "-q", "-m", "chore: 初始化测试仓库")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def git(self, *args: str) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            ["git", "-C", str(self.root), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode != 0:
            self.fail(result.stderr or result.stdout)
        return result

    def raw_git(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "-C", str(self.root), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    def test_feedback_is_local_specific_and_redacted(self) -> None:
        ordinary = {"cwd": str(self.root), "prompt": "请删除临时文件，然后重新构建"}
        self.assertEqual(runtime.detect_feedback_signal(ordinary), 0)
        queue = self.root / ".codex" / "evolution" / "runtime" / "signals.jsonl"
        self.assertFalse(queue.exists())

        correction = {
            "cwd": str(self.root),
            "prompt": (
                "你理解错了，api_key=abc123secret，token:xyz987654，"
                "ghp_abcdefghijklmnopqrstuvwxyz1234567890，"
                "AKIAABCDEFGHIJKLMNOP，"
                "postgres://user:supersecret@example.invalid/db，"
                "-----BEGIN PRIVATE KEY-----\nprivate-value\n-----END PRIVATE KEY-----"
            ),
        }
        self.assertEqual(runtime.detect_feedback_signal(correction), 0)
        content = queue.read_text(encoding="utf-8")
        self.assertIn("[REDACTED]", content)
        self.assertNotIn("abc123secret", content)
        self.assertNotIn("xyz987654", content)
        self.assertNotIn("ghp_abcdefghijklmnopqrstuvwxyz1234567890", content)
        self.assertNotIn("AKIAABCDEFGHIJKLMNOP", content)
        self.assertNotIn("supersecret", content)
        self.assertNotIn("private-value", content)
        ignored = subprocess.run(
            ["git", "-C", str(self.root), "check-ignore", "-q", str(queue)],
            check=False,
        )
        self.assertEqual(ignored.returncode, 0)

    def test_review_fingerprint_covers_config_and_shell_writes(self) -> None:
        (self.root / "Product-Spec.md").write_text("需求", encoding="utf-8")
        self.assertIsNone(review_gate.review_fingerprint(self.root))

        package = self.root / "package.json"
        package.write_text('{"name":"demo"}\n', encoding="utf-8")
        first = review_gate.review_fingerprint(self.root)
        self.assertIsNotNone(first)
        review_gate.mark_review_needed({"cwd": str(self.root)})
        state = review_gate.read_review_state(self.root)
        self.assertEqual(state["status"], "pending")
        self.assertFalse(runtime.enforce_commit_gate(self.root)[0])

        with contextlib.redirect_stdout(io.StringIO()):
            review_gate.mark_reviewed({"cwd": str(self.root)})
        self.assertTrue(runtime.enforce_commit_gate(self.root)[0])
        quiet = io.StringIO()
        with contextlib.redirect_stdout(quiet):
            review_gate.stop_gate({"cwd": str(self.root), "stop_hook_active": False})
        self.assertEqual(quiet.getvalue(), "")

        package.write_text('{"name":"changed-by-shell"}\n', encoding="utf-8")
        self.assertNotEqual(first, review_gate.review_fingerprint(self.root))
        self.assertFalse(runtime.enforce_commit_gate(self.root)[0])
        first_stop = io.StringIO()
        with contextlib.redirect_stdout(first_stop):
            review_gate.stop_gate({"cwd": str(self.root), "stop_hook_active": False})
        self.assertEqual(json.loads(first_stop.getvalue())["decision"], "block")

        repeated_stop = io.StringIO()
        with contextlib.redirect_stdout(repeated_stop):
            review_gate.stop_gate({"cwd": str(self.root), "stop_hook_active": True})
        repeated = json.loads(repeated_stop.getvalue())
        self.assertIn("systemMessage", repeated)
        self.assertNotIn("decision", repeated)

    def test_pre_commit_checks_are_configurable_and_shell_free(self) -> None:
        config_path = self.root / ".codex" / "project-checks.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            json.dumps(
                {
                    "preCommitChecks": [
                        {
                            "name": "pass",
                            "argv": ["{python}", "-c", "print('ok')"],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        self.assertEqual(runtime.run_pre_commit_checks(self.root), (True, ""))

        config_path.write_text(
            json.dumps(
                {
                    "preCommitChecks": [
                        {
                            "name": "fail",
                            "argv": ["{python}", "-c", "raise SystemExit(7)"],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        passed, detail = runtime.run_pre_commit_checks(self.root)
        self.assertFalse(passed)
        self.assertIn("fail未通过", detail)

        if shutil.which("npm"):
            config_path.write_text(
                json.dumps(
                    {"preCommitChecks": [{"name": "npm", "argv": ["npm", "--version"]}]}
                ),
                encoding="utf-8",
            )
            self.assertEqual(runtime.run_pre_commit_checks(self.root), (True, ""))

    def test_commit_msg_hook_enforces_review_before_git_commit(self) -> None:
        shutil.copytree(HOOKS, self.root / ".codex" / "hooks")
        hooks_dir = self.root / ".githooks"
        hooks_dir.mkdir()
        shutil.copy2(REPO_ROOT / ".githooks" / "commit-msg", hooks_dir / "commit-msg")
        self.git("config", "core.hooksPath", ".githooks")
        (self.root / "app.py").write_text("print('ready')\n", encoding="utf-8")
        self.git("add", "app.py")

        blocked = self.raw_git("commit", "-m", "feat: 增加应用入口")
        self.assertNotEqual(blocked.returncode, 0)
        self.assertIn("尚未通过两阶段", blocked.stderr)

        with contextlib.redirect_stdout(io.StringIO()):
            review_gate.mark_reviewed({"cwd": str(self.root)})
        committed = self.raw_git("commit", "-m", "feat: 增加应用入口")
        self.assertEqual(committed.returncode, 0, committed.stderr)


class PureBehaviorTests(unittest.TestCase):
    def test_git_commit_detection_rejects_mentions(self) -> None:
        self.assertFalse(runtime.is_git_commit_command("echo git commit"))
        self.assertFalse(runtime.is_git_commit_command("git status"))
        self.assertTrue(runtime.is_git_commit_command("echo x | git commit -F -"))
        self.assertTrue(runtime.is_git_commit_command("git commit -m 'fix: 修复问题'"))
        self.assertTrue(runtime.is_git_commit_command("git -C repo commit -m x"))
        self.assertTrue(runtime.is_git_commit_command("git --no-pager commit"))
        self.assertTrue(runtime.is_git_init_command("git init product"))

    def test_commit_message_requires_han_characters(self) -> None:
        with tempfile.TemporaryDirectory(prefix="hengxin-message-test-") as directory:
            message = Path(directory) / "COMMIT_EDITMSG"
            message.write_text("feat: add login\n", encoding="utf-8")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(runtime.validate_commit_message(str(message)), 1)
            message.write_text("feat: 增加登录\n", encoding="utf-8")
            self.assertEqual(runtime.validate_commit_message(str(message)), 0)


if __name__ == "__main__":
    unittest.main()
