from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


HOOKS = Path(__file__).resolve().parents[1] / ".codex" / "hooks"
sys.path.insert(0, str(HOOKS))

import reuse_gate


class ReuseGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="hengxin-reuse-gate-test-")
        self.root = Path(self.temporary.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Harness Test")
        self.git("config", "user.email", "harness@example.invalid")
        (self.root / ".gitignore").write_text(".cache/\n", encoding="utf-8")
        self.git("add", ".gitignore")
        self.git("commit", "-q", "-m", "chore: 初始化测试仓库")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def git(self, *args: str) -> None:
        result = subprocess.run(
            ["git", "-C", str(self.root), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def config(self, *protected_paths: str) -> dict[str, object]:
        return {
            "allowedFrontendRoots": ["product/web"],
            "protectedPaths": list(protected_paths),
            "parallelEntryPatterns": ["**/vite.config.*", "**/src/App.vue", "**/src/App.tsx"],
            "frontendPackages": ["vue", "react", "vite"],
        }

    def add_protected_app(self) -> Path:
        protected = self.root / "product" / "web" / "src" / "App.vue"
        protected.parent.mkdir(parents=True)
        protected.write_text("<template>baseline</template>\n", encoding="utf-8")
        self.git("add", "product/web/src/App.vue")
        return protected

    def test_preserves_baseline_and_blocks_parallel_frontend_manifest(self) -> None:
        protected = self.add_protected_app()
        manifest = protected.parents[1] / "package.json"
        manifest.write_text('{"dependencies":{"vue":"3"}}\n', encoding="utf-8")
        self.git("add", "product/web/package.json")
        config = self.config("product/web/package.json", "product/web/src/App.vue")
        self.assertEqual(reuse_gate.enforce_reuse_baseline(self.root, config), (True, ""))

        parallel = self.root / "product" / "new-ui"
        parallel.mkdir(parents=True)
        (parallel / "package.json").write_text(
            '{"devDependencies":{"vite":"7"}}\n', encoding="utf-8"
        )
        self.git("add", "product/new-ui/package.json")
        passed, detail = reuse_gate.enforce_reuse_baseline(self.root, config)
        self.assertFalse(passed)
        self.assertIn("平行前端根", detail)

    def test_rejects_missing_protected_path_but_allows_backend_manifest(self) -> None:
        backend = self.root / "product" / "api"
        backend.mkdir(parents=True)
        (backend / "package.json").write_text(
            '{"dependencies":{"fastify":"5"}}\n', encoding="utf-8"
        )
        self.git("add", "product/api/package.json")
        config = self.config("product/web/src/App.vue")
        passed, detail = reuse_gate.enforce_reuse_baseline(self.root, config)
        self.assertFalse(passed)
        self.assertIn("母版关键路径", detail)

        self.add_protected_app()
        self.assertEqual(reuse_gate.enforce_reuse_baseline(self.root, config), (True, ""))

    def test_blocks_root_level_parallel_entries(self) -> None:
        self.add_protected_app()
        root_src = self.root / "src"
        root_src.mkdir()
        (root_src / "App.vue").write_text("<template />\n", encoding="utf-8")
        (root_src / "App.tsx").write_text("export default null\n", encoding="utf-8")
        (self.root / "vite.config.ts").write_text("export default {}\n", encoding="utf-8")
        self.git("add", "src/App.vue", "src/App.tsx", "vite.config.ts")

        passed, detail = reuse_gate.enforce_reuse_baseline(
            self.root, self.config("product/web/src/App.vue")
        )
        self.assertFalse(passed)
        self.assertIn("src/App.vue", detail)
        self.assertIn("src/App.tsx", detail)
        self.assertIn("vite.config.ts", detail)

    def test_checks_rename_destination_as_added_path(self) -> None:
        protected = self.add_protected_app()
        legacy = protected.with_name("Legacy.vue")
        legacy.write_text("<template>parallel</template>\n", encoding="utf-8")
        self.git("add", "product/web/src/Legacy.vue")
        self.git("commit", "-q", "-m", "feat: 增加母版文件")

        root_src = self.root / "src"
        root_src.mkdir()
        legacy.rename(root_src / "App.vue")
        self.git("add", "--all")

        passed, detail = reuse_gate.enforce_reuse_baseline(
            self.root, self.config("product/web/src/App.vue")
        )
        self.assertFalse(passed)
        self.assertIn("src/App.vue", detail)

    def test_rejects_windows_absolute_root_and_normalizes_windows_pattern(self) -> None:
        self.add_protected_app()
        absolute_config = self.config("product/web/src/App.vue")
        absolute_config["allowedFrontendRoots"] = [r"C:\outside\web"]
        passed, detail = reuse_gate.enforce_reuse_baseline(self.root, absolute_config)
        self.assertFalse(passed)
        self.assertIn("只能使用仓库内相对路径", detail)

        root_src = self.root / "src"
        root_src.mkdir()
        (root_src / "App.vue").write_text("<template />\n", encoding="utf-8")
        self.git("add", "src/App.vue")
        windows_pattern_config = self.config("product/web/src/App.vue")
        windows_pattern_config["parallelEntryPatterns"] = [r"**\src\App.vue"]
        passed, detail = reuse_gate.enforce_reuse_baseline(self.root, windows_pattern_config)
        self.assertFalse(passed)
        self.assertIn("src/App.vue", detail)


if __name__ == "__main__":
    unittest.main()
