# devneya

devneya is a self-contained terminal interface for DeepSeek Harness (DSH). The v0.1.0 implementation embeds an ordinary Node runtime and the frozen application dependencies inside one executable for each supported platform.

**Release status:** a local Linux candidate passed all 29 acceptance scenarios. Both Linux targets passed native CI acceptance on Ubuntu 22.04; macOS remains unqualified. Windows is preview-only and unqualified. No public release is available yet.

The selected build uses Chimney `@deepseek-harness-tui/dsh-tui@0.15.0` and DSH `@deepseek-ai/dsh@0.2.0-rc.2`. DSH RC.2 is a prerelease explicitly accepted for this build; it is not stable.

## Download and start

When a qualified release is available, download the archive for your operating system and CPU, extract it, and run the executable from your project directory. The executable is named `devneya` on Linux and macOS, and `devneya.exe` on Windows.

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

The intended required targets are Linux x64 and arm64 on Ubuntu 22.04 with glibc 2.35, and macOS x64 and arm64 on macOS 15. The Linux baselines passed all 29 native CI scenarios at source `adeabe610a254427b8b77e1fce377a75df347ead`; macOS qualification is pending. Windows x64 on Windows Server 2025 is preview-only and will be distributed only if the full acceptance suite passes on that target.

Linux and Windows executables are unsigned. macOS executables are ad-hoc signed and are not notarized. No paid signing is planned. Each release will state which targets passed acceptance and provide checksums and the exact bundled-version manifest.

## Licenses and corresponding sources

Each platform archive contains third-party notices and an SBOM. The executable also embeds them under `runtime/<build-id>/legal` after extraction. A separate native-source archive contains the pinned native library sources, Rust dependency sources, build recipes and patches. The source index and original license bytes are tracked in [`third_party`](third_party/README.md).
