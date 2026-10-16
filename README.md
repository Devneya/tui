# devneya

devneya is a self-contained terminal interface for DeepSeek Harness (DSH). The v0.1.0 implementation embeds an ordinary Node runtime and the frozen application dependencies inside one executable for each supported platform.

Each published platform archive includes checksums, a build manifest, an SBOM, license notices, and its finished-executable acceptance report.

The selected build uses Chimney `@deepseek-harness-tui/dsh-tui@0.15.0` and DSH `@deepseek-ai/dsh@0.2.0-rc.2`. DSH RC.2 is a prerelease explicitly accepted for this build; it is not stable.

## Download and start

Download the archive for your operating system and CPU from [GitHub Releases](https://github.com/Devneya/tui/releases), extract it, and run the executable from your project directory. The executable is named `devneya` on Linux and macOS, and `devneya.exe` on Windows.

```sh
cd /path/to/project
./devneya
```

On Windows, open a terminal in the project and run:

```powershell
cd C:\path\to\project
.\devneya.exe
```

The current directory becomes the workspace. First launch opens the TUI without downloading packages. Use `/provider` to configure an inference provider and `/model` to select a model. You can configure another provider without first entering a DeepSeek API key. Inference requires a configured provider or local model server.

## Commands

The v0.1.0 command line is:

```text
devneya [--cwd DIR] [--resume ID]
devneya --version
devneya --help
devneya doctor [--json]
devneya repair
```

`--cwd DIR` chooses the project workspace. Without it, devneya uses the current directory. `--resume ID` resumes a saved session by ID. In the TUI, `/resume` opens the session browser so you can select a saved session. `doctor` reports embedded versions, platform, application paths, missing optional tools, and validation problems. `doctor --json` writes the same diagnostics in JSON without exposing credentials. `repair` rebuilds the extracted application runtime from the copy embedded in the executable; it preserves profiles, credentials, preferences, and sessions.

## Application data

All devneya-owned files live under one application root. Set `DEVNEYA_HOME` to an absolute, private directory to choose another root. The root cannot be a filesystem root or your home directory. An existing nonempty directory without devneya's ownership marker is refused, so devneya will not claim unrelated files.

| Platform | Default application root |
|---|---|
| Linux | `$XDG_DATA_HOME/devneya` when `XDG_DATA_HOME` is absolute; otherwise `~/.local/share/devneya` |
| macOS | `~/Library/Application Support/devneya` |
| Windows | `%LOCALAPPDATA%\devneya` (requires an absolute `LOCALAPPDATA`) |

The root separates replaceable runtime files from user data:

```text
<application-root>/
  runtime/<build-id>/   # extracted Node runtime and application code
  data/profiles/devneya/ # DSH profile and provider configuration
  data/sessions/        # saved DSH sessions and attachments
  tui/                  # TUI preferences, including language selection
  cache/
  logs/                 # diagnostics with secrets redacted
```

DSH-owned profiles and provider credentials are kept beneath `data/`; TUI preferences are kept separately in `tui/`.

The project workspace stays in the directory you selected. devneya does not reuse or modify an existing DSH installation, global packages, package-manager caches, or shell configuration.

## Update and uninstall

To update, replace the whole executable with the executable from a newer qualified release. Its embedded build identity selects the extracted runtime while the application root keeps profiles, credentials, preferences, and sessions separately. Use `repair` when the extracted runtime is damaged; it does not erase application data.

To uninstall, remove the executable and its downloaded archive. This leaves the application root in place. Removing the root also deletes devneya's settings, credentials, caches, logs, sessions, and extracted runtime. Project files remain in their workspace directories.

## External tools and optional capabilities

The bundled application runtime does not require system Node, Bun, DSH, npm, pnpm, or a package manager. Some integrations can use external programs or services, such as Git, ripgrep, Neovim, a browser, or an MCP server. Those capabilities are available only when the relevant program or service is installed and configured; they are not prerequisites for opening the basic TUI. A configured inference provider or local model server is needed to run a model.

## Supported platforms and signing

The release matrix is below. Every published Linux/macOS executable must pass all 29 mandatory acceptance scenarios. The build manifest and acceptance report record the exact runner image and tested OS; compatibility with older OS versions is not inferred.

| Target | Qualification baseline | Native CI environment |
|---|---|---|
| Linux x64 | Ubuntu 22.04; glibc 2.35 | `ubuntu-22.04` |
| Linux arm64 | Ubuntu 22.04; glibc 2.35 | `ubuntu-22.04-arm` |
| macOS arm64 | macOS 15 | `macos-15`; tested macOS 15.7.9 |
| macOS x64 | macOS 15 | `macos-15-intel`; tested macOS 15.7.9 |
| Windows x64 | Windows Server 2025; conditional preview | `windows-2025`; omitted unless fully qualified |

Windows is currently unqualified. Its bundled LibreOffice helper has unresolved native runtime dependencies, including Visual C++ runtime DLLs. A Windows download is supplied only when the release notes explicitly report successful qualification.

Linux and Windows executables are unsigned. macOS executables are ad-hoc signed and are not notarized. No paid signing is planned. Each release will state which targets passed acceptance and provide checksums and the exact bundled-version manifest.

## Licenses and corresponding sources

Each platform archive contains third-party notices and an SBOM. The executable also embeds them under `runtime/<build-id>/legal` after extraction. A separate native-source archive contains the pinned native library sources, Rust dependency sources, build recipes and patches. The source index and original license bytes are tracked in [`third_party`](third_party/README.md).
