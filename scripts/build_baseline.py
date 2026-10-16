#!/usr/bin/env python3
"""Build the committed first-parent executable as a rollback acceptance fixture."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[1]
PINNED_CONFIG_KEYS = ("version", "node", "dsh", "tui", "payloadFormatVersion")
REQUIRED_PARENT_FILES = ("build.json", "scripts/build.py", "cmd/devneya/main.go")
TARGET_PATTERN = re.compile(r"^(?:linux-(?:x64|arm64)|darwin-(?:x64|arm64)|windows-x64)$")


class BaselineError(RuntimeError):
    """A baseline cannot safely or accurately be built."""


def git(repo: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), *args],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError as error:
        raise BaselineError("git is required to create the rollback source worktree") from error
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() or error.stdout.strip() or str(error)
        raise BaselineError(f"git {' '.join(args)} failed: {detail}") from error
    return result.stdout.strip()


def load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BaselineError(f"Cannot read {label}: {error}") from error
    if not isinstance(value, dict):
        raise BaselineError(f"{label} must contain a JSON object")
    return value


def read_parent_config(repo: Path, parent: str) -> dict[str, Any]:
    tracked = set(git(repo, "ls-tree", "-r", "--name-only", parent).splitlines())
    if "build.json" not in tracked:
        raise BaselineError(f"Parent commit {parent} does not track build.json")
    try:
        raw = subprocess.run(
            ["git", "-C", str(repo), "show", f"{parent}:build.json"],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        ).stdout
        value = json.loads(raw)
    except (subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise BaselineError(f"Cannot read parent build.json at {parent}: {error}") from error
    if not isinstance(value, dict):
        raise BaselineError(f"Parent build.json at {parent} must contain a JSON object")
    return value


def ensure_config_compatible(current: dict[str, Any], parent_config: dict[str, Any], target: str) -> None:
    for key in PINNED_CONFIG_KEYS:
        if key not in current:
            raise BaselineError(f"Current build.json is missing pinned field {key!r}")
        if key not in parent_config:
            raise BaselineError(f"Parent build.json is missing pinned field {key!r}")
        if current[key] != parent_config[key]:
            raise BaselineError(
                f"Parent build.json is incompatible: {key} is {parent_config[key]!r}, "
                f"current build.json requires {current[key]!r}"
            )
    if target not in current.get("targets", {}):
        raise BaselineError(f"Target {target!r} is not configured in current build.json")
    if target not in parent_config.get("targets", {}):
        raise BaselineError(f"Target {target!r} is not configured in parent build.json")


def ensure_within_repo(repo: Path, path: Path, label: str) -> None:
    resolved = path.resolve()
    if not resolved.is_relative_to(repo.resolve()):
        raise BaselineError(f"{label} must stay inside the repository: {path}")


def prepare_build_root(repo: Path) -> Path:
    build_root = repo / ".build"
    if build_root.is_symlink():
        raise BaselineError("Refusing to use a symlink for the repository .build directory")
    if build_root.exists() and not build_root.is_dir():
        raise BaselineError("Repository .build path exists and is not a directory")
    build_root.mkdir(exist_ok=True)
    ensure_within_repo(repo, build_root, "Build directory")
    return build_root


def refuse_nonempty_directory(path: Path, label: str, *, remove_empty: bool = False) -> None:
    if not path.exists() and not path.is_symlink():
        return
    if path.is_symlink() or not path.is_dir():
        raise BaselineError(f"Refusing to use existing non-directory or symlink {label}: {path}")
    try:
        next(path.iterdir())
    except StopIteration:
        if remove_empty:
            path.rmdir()
        return
    raise BaselineError(f"Refusing to overwrite nonempty {label}: {path}")


def check_parent(repo: Path, current_config: dict[str, Any], target: str) -> str:
    try:
        parent = git(repo, "rev-parse", "--verify", "HEAD^")
    except BaselineError as error:
        raise BaselineError(
            "Cannot build rollback baseline: the current checkout has no available first-parent "
            "commit (HEAD^). Fetch parent history and ensure the preceding implementation commit exists."
        ) from error
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", parent):
        raise BaselineError(f"git returned an invalid parent commit ID: {parent!r}")
    git(repo, "cat-file", "-e", f"{parent}^{{commit}}")

    tracked = set(git(repo, "ls-tree", "-r", "--name-only", parent).splitlines())
    for required in REQUIRED_PARENT_FILES:
        if required not in tracked:
            raise BaselineError(f"Parent commit {parent} does not track required file {required}")

    parent_config = read_parent_config(repo, parent)
    ensure_config_compatible(current_config, parent_config, target)
    return parent.lower()


def build_in_worktree(repo: Path, worktree: Path, target: str) -> None:
    env = os.environ.copy()
    env["CGO_ENABLED"] = "0"
    env["GOTOOLCHAIN"] = "local"
    command = [sys.executable, str(worktree / "scripts" / "build.py"), "--target", target]
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=worktree, env=env, check=True)


def validate_outputs(
    worktree: Path,
    target: str,
    parent: str,
    current_config: dict[str, Any],
) -> tuple[Path, Path]:
    output_dir = worktree / "dist" / target
    binary_name = "devneya.exe" if target.startswith("windows-") else "devneya"
    binary = output_dir / binary_name
    manifest_path = output_dir / "build-manifest.json"
    for path, label in ((binary, "baseline executable"), (manifest_path, "baseline build manifest")):
        if path.is_symlink() or not path.is_file():
            raise BaselineError(f"Baseline build did not produce a regular {label}: {path}")
        ensure_within_repo(worktree, path, label)

    manifest = load_json(manifest_path, "baseline build-manifest.json")
    expected = {
        "target": target,
        "sourceCommit": parent,
        "nodeVersion": current_config["node"],
        "dshVersion": current_config["dsh"],
        "tuiVersion": current_config["tui"],
        "version": current_config["version"],
    }
    for key, expected_value in expected.items():
        actual = manifest.get(key)
        if actual != expected_value:
            raise BaselineError(
                f"Baseline build manifest {key} mismatch: expected {expected_value!r}, got {actual!r}"
            )
    if manifest.get("releaseEligible") is not True:
        raise BaselineError(
            "Baseline build manifest releaseEligible mismatch: expected True, "
            f"got {manifest.get('releaseEligible')!r}"
        )
    if not target.startswith("windows-") and not os.access(binary, os.X_OK):
        raise BaselineError(f"Baseline executable is not executable: {binary}")
    return binary, manifest_path


def ensure_tracked_source_unchanged(worktree: Path) -> None:
    result = subprocess.run(
        ["git", "-C", str(worktree), "diff", "--quiet", "HEAD", "--"],
        check=False,
    )
    if result.returncode != 0:
        raise BaselineError(
            f"Baseline build modified tracked source; refusing its output and retaining worktree at {worktree}"
        )


def append_github_env(binary: Path) -> None:
    env_file = os.environ.get("GITHUB_ENV")
    if not env_file:
        return
    value = str(binary.resolve())
    if "\n" in value or "\r" in value:
        raise BaselineError("Rollback executable path cannot contain newlines when writing GITHUB_ENV")
    with Path(env_file).open("a", encoding="utf-8", newline="") as output:
        output.write(f"DEVNEYA_ROLLBACK_BINARY={value}\n")


def cleanup_worktree(repo: Path, worktree: Path) -> None:
    try:
        result = subprocess.run(
            ["git", "-C", str(worktree), "diff", "--quiet", "HEAD", "--"],
            check=False,
        )
    except OSError as error:
        raise BaselineError(f"Cannot verify baseline worktree before cleanup: {error}") from error
    if result.returncode != 0:
        raise BaselineError(
            f"Refusing to remove baseline worktree with tracked changes; inspect it at {worktree}"
        )
    try:
        subprocess.run(
            ["git", "-C", str(repo), "worktree", "remove", "--force", str(worktree)],
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise BaselineError(f"Could not remove owned baseline worktree {worktree}: {error}") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    try:
        current_config = load_json(REPO / "build.json", "current build.json")
    except BaselineError as error:
        parser.error(str(error))
    configured_targets = current_config.get("targets")
    if not isinstance(configured_targets, dict):
        parser.error("Current build.json targets must be a JSON object")
    parser.add_argument("--target", required=True, choices=tuple(configured_targets))
    args = parser.parse_args(argv)
    if not TARGET_PATTERN.fullmatch(args.target):
        parser.error(f"Unsupported target name: {args.target!r}")

    worktree_added = False
    worktree: Path | None = None
    failure: Exception | None = None
    executable_out: Path | None = None
    try:
        if Path(git(REPO, "rev-parse", "--show-toplevel")).resolve() != REPO.resolve():
            raise BaselineError(f"Build helper repository root does not match git worktree: {REPO}")
        parent = check_parent(REPO, current_config, args.target)

        build_root = prepare_build_root(REPO)
        worktree = build_root / f"rollback-source-{args.target}"
        ensure_within_repo(REPO, worktree, "Baseline worktree")
        refuse_nonempty_directory(worktree, "baseline worktree", remove_empty=True)

        rollback_root = build_root / "rollback"
        if rollback_root.is_symlink():
            raise BaselineError(f"Refusing to use symlink rollback output directory: {rollback_root}")
        if rollback_root.exists() and not rollback_root.is_dir():
            raise BaselineError(f"Rollback output path exists and is not a directory: {rollback_root}")
        rollback_root.mkdir(exist_ok=True)
        ensure_within_repo(REPO, rollback_root, "Rollback output directory")
        output_dir = rollback_root / args.target
        ensure_within_repo(REPO, output_dir, "Rollback output target")
        refuse_nonempty_directory(output_dir, "rollback output directory")

        print(f"+ git worktree add --detach {worktree} {parent}", flush=True)
        subprocess.run(
            ["git", "-C", str(REPO), "worktree", "add", "--detach", str(worktree), parent],
            check=True,
        )
        worktree_added = True

        build_in_worktree(REPO, worktree, args.target)
        ensure_tracked_source_unchanged(worktree)
        baseline_binary, baseline_manifest = validate_outputs(worktree, args.target, parent, current_config)

        output_dir.mkdir(parents=True, exist_ok=True)
        copied_binary = output_dir / baseline_binary.name
        copied_manifest = output_dir / "build-manifest.json"
        shutil.copy2(baseline_binary, copied_binary)
        shutil.copy2(baseline_manifest, copied_manifest)
        executable_out = copied_binary.resolve()
        append_github_env(executable_out)
    except (BaselineError, OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        failure = error
    finally:
        if worktree_added and worktree is not None:
            try:
                cleanup_worktree(REPO, worktree)
            except BaselineError as error:
                if failure is None:
                    failure = error
                else:
                    print(f"error: {error}", file=sys.stderr, flush=True)

    if failure is not None:
        print(f"error: {failure}", file=sys.stderr, flush=True)
        return 1
    assert executable_out is not None
    print(executable_out, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
