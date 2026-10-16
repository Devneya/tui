import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
HELPER_SOURCE = REPO / "scripts" / "build_baseline.py"


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip()


class BuildBaselineTests(unittest.TestCase):
    def setUp(self):
        self.reset_repo()

    def reset_repo(self):
        if hasattr(self, "temp"):
            self.temp.cleanup()
        self.temp = tempfile.TemporaryDirectory(prefix="devneya-build-baseline-")
        self.repo = Path(self.temp.name) / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "-q")
        git(self.repo, "config", "user.name", "Baseline Test")
        git(self.repo, "config", "user.email", "baseline-test@example.invalid")

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def config(*, dsh="0.2.0-rc.2"):
        return {
            "product": "devneya",
            "version": "0.1.0",
            "node": "24.22.0",
            "go": "1.27.2",
            "dsh": dsh,
            "tui": "0.15.0",
            "payloadFormatVersion": 1,
            "targets": {"linux-x64": {"baseline": "Ubuntu 22.04; glibc 2.35"}},
        }

    def write(self, relative: str, content: str):
        path = self.repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def commit(self, message: str):
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", message)
        return git(self.repo, "rev-parse", "HEAD")

    def builder_source(self, *, variant="valid", tracked_edit=False):
        variant_expr = repr(variant)
        tracked_edit_expr = repr(tracked_edit)
        return f'''import json
import subprocess
import sys
from pathlib import Path

if sys.argv[1:] != ["--target", "linux-x64"]:
    raise SystemExit("expected only --target linux-x64")
root = Path.cwd()
config = json.loads((root / "build.json").read_text(encoding="utf-8"))
source = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
target = "darwin-x64" if {variant_expr} == "wrong-target" else "linux-x64"
manifest_source = "f" * 40 if {variant_expr} == "wrong-source" else source
manifest_node = "0.0.0" if {variant_expr} == "wrong-node" else config["node"]
release_eligible = False if {variant_expr} == "not-release-eligible" else True
if {tracked_edit_expr}:
    (root / "cmd/devneya/main.go").write_text("unexpected tracked edit\\n", encoding="utf-8")
if {variant_expr} == "readonly-cache":
    cache = root / ".build" / "module-cache" / "read-only"
    cache.mkdir(parents=True)
    file = cache / "LICENSE"
    file.write_text("generated module-cache fixture")
    file.chmod(0o400)
    cache.chmod(0o500)
out = root / "dist" / "linux-x64"
out.mkdir(parents=True, exist_ok=True)
binary = out / "devneya"
binary.write_bytes(b"rollback baseline executable")
binary.chmod(0o755)
manifest = {{
    "product": config["product"],
    "version": config["version"],
    "target": target,
    "sourceCommit": manifest_source,
    "nodeVersion": manifest_node,
    "dshVersion": config["dsh"],
    "tuiVersion": config["tui"],
    "releaseEligible": release_eligible,
}}
(out / "build-manifest.json").write_text(json.dumps(manifest) + "\\n", encoding="utf-8")
'''

    def create_parent_and_candidate(
        self,
        *,
        parent_config=None,
        include_build_script=True,
        include_main=True,
        variant="valid",
        tracked_edit=False,
        only_one_commit=False,
    ):
        parent_config = parent_config or self.config()
        self.write("build.json", json.dumps(parent_config))
        if include_build_script:
            self.write("scripts/build.py", self.builder_source(variant=variant, tracked_edit=tracked_edit))
        if include_main:
            self.write("cmd/devneya/main.go", "package main\nfunc main() {}\n")
        self.write("README.md", "baseline parent\n")
        if only_one_commit:
            (self.repo / "scripts").mkdir(parents=True, exist_ok=True)
            shutil.copyfile(HELPER_SOURCE, self.repo / "scripts" / "build_baseline.py")
            return self.commit("single candidate commit")

        parent = self.commit("baseline implementation")
        self.write("build.json", json.dumps(self.config()))
        (self.repo / "scripts").mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HELPER_SOURCE, self.repo / "scripts" / "build_baseline.py")
        if not include_build_script:
            self.write("scripts/build.py", self.builder_source(variant=variant, tracked_edit=tracked_edit))
        if not include_main:
            self.write("cmd/devneya/main.go", "package main\nfunc main() {}\n")
        self.write("README.md", "candidate commit\n")
        self.commit("candidate implementation")
        return parent

    def run_helper(self, *, extra_env=None):
        env = os.environ.copy()
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            [sys.executable, str(self.repo / "scripts" / "build_baseline.py"), "--target", "linux-x64"],
            cwd=self.repo,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
        )

    def test_builds_first_parent_fixture_and_exports_absolute_path(self):
        parent = self.create_parent_and_candidate()
        github_env = self.repo / "github-env"
        github_env.write_text("", encoding="utf-8")

        result = self.run_helper(extra_env={"GITHUB_ENV": str(github_env)})

        self.assertEqual(result.returncode, 0, result.stderr)
        output = self.repo / ".build" / "rollback" / "linux-x64"
        binary = output / "devneya"
        manifest = json.loads((output / "build-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(binary.read_bytes(), b"rollback baseline executable")
        self.assertEqual(manifest["sourceCommit"], parent)
        self.assertEqual(manifest["target"], "linux-x64")
        self.assertTrue(binary.is_absolute())
        self.assertEqual(result.stdout.strip().splitlines()[-1], str(binary.resolve()))
        self.assertEqual(github_env.read_text(encoding="utf-8"), f"DEVNEYA_ROLLBACK_BINARY={binary.resolve()}\n")
        self.assertFalse((self.repo / ".build" / "rollback-source-linux-x64").exists())

    def test_fails_clearly_when_first_parent_is_unavailable(self):
        self.create_parent_and_candidate(only_one_commit=True)

        result = self.run_helper()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no available first-parent commit (HEAD^)", result.stderr)
        self.assertFalse((self.repo / ".build" / "rollback-source-linux-x64").exists())

    def test_cleans_readonly_module_cache_inside_its_owned_worktree(self):
        self.create_parent_and_candidate(variant="readonly-cache")
        result = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.repo / ".build" / "rollback-source-linux-x64").exists())

    def test_rejects_incompatible_pinned_parent_config(self):
        self.create_parent_and_candidate(parent_config=self.config(dsh="0.1.0"))

        result = self.run_helper()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Parent build.json is incompatible: dsh", result.stderr)
        self.assertFalse((self.repo / ".build" / "rollback-source-linux-x64").exists())

    def test_requires_parent_build_script_and_launcher_source(self):
        for missing_build, missing_main, expected in (
            (True, False, "scripts/build.py"),
            (False, True, "cmd/devneya/main.go"),
        ):
            with self.subTest(missing=expected):
                self.reset_repo()
                self.create_parent_and_candidate(
                    include_build_script=not missing_build,
                    include_main=not missing_main,
                )
                result = self.run_helper()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"does not track required file {expected}", result.stderr)
                self.assertFalse((self.repo / ".build" / "rollback-source-linux-x64").exists())

    def test_validates_parent_identity_in_generated_manifest(self):
        for variant, expected in (
            ("wrong-target", "build manifest target mismatch"),
            ("wrong-source", "build manifest sourceCommit mismatch"),
            ("wrong-node", "build manifest nodeVersion mismatch"),
        ):
            with self.subTest(variant=variant):
                self.reset_repo()
                self.create_parent_and_candidate(variant=variant)
                result = self.run_helper()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected, result.stderr)
                self.assertFalse((self.repo / ".build" / "rollback-source-linux-x64").exists())

    def test_requires_parent_manifest_to_be_release_eligible(self):
        self.create_parent_and_candidate(variant="not-release-eligible")

        result = self.run_helper()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("build manifest releaseEligible mismatch: expected True, got False", result.stderr)
        self.assertFalse((self.repo / ".build" / "rollback-source-linux-x64").exists())

    def test_refuses_nonempty_owned_worktree_path(self):
        self.create_parent_and_candidate()
        worktree = self.repo / ".build" / "rollback-source-linux-x64"
        worktree.mkdir(parents=True)
        user_file = worktree / "keep-me.txt"
        user_file.write_text("user data", encoding="utf-8")

        result = self.run_helper()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to overwrite nonempty baseline worktree", result.stderr)
        self.assertEqual(user_file.read_text(encoding="utf-8"), "user data")

    def test_preserves_worktree_if_baseline_build_changes_tracked_source(self):
        self.create_parent_and_candidate(tracked_edit=True)

        result = self.run_helper()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to remove baseline worktree with tracked changes", result.stderr)
        worktree = self.repo / ".build" / "rollback-source-linux-x64"
        self.assertTrue(worktree.is_dir())
        self.assertFalse((self.repo / ".build" / "rollback" / "linux-x64").exists())
        self.assertEqual((worktree / "cmd/devneya/main.go").read_text(encoding="utf-8"), "unexpected tracked edit\n")


if __name__ == "__main__":
    unittest.main()
