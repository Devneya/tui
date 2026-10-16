# DSH TUI packaging notes

**Updated:** 2026-10-16
**Status:** TUI and DSH line selected; no standalone artifact has been built or accepted yet.

## Selected pair

- **TUI:** Chimney, [`ccch1mneyyy/dsh-TUI`](https://github.com/ccch1mneyyy/dsh-TUI), package `@deepseek-harness-tui/dsh-tui`.
- **DSH:** `@deepseek-ai/dsh@0.2.0-rc.2`.

DSH `0.2.1-alpha.4` is the newest published prerelease checked on 2026-10-16; npm's `latest` tag remains `0.2.0-rc.2`. Chimney's current source declares DSH compatibility through `0.2.0-rc.2`, so RC2 is the selected compatibility target. Revisit the alpha only after Chimney declares and passes compatibility checks for it.

## Packaging implications

- The checked-in Chimney `standalone/package.json` is an old template: it pins DSH `0.1.1-rc.2` and TUI `0.9.2`. This does not prevent using Chimney; update the standalone dependency set to the selected pair.
- Update the complete DSH package family together, then regenerate and review the pnpm lockfile. Keep manifest versions, lockfile resolutions, launcher constants, profile composition, and embedded build identity in sync. Do not resolve new dependencies during the release build.
- Preserve normal Node package boundaries and dynamic loading. Bundle an exact Node runtime and the frozen dependency tree; launch with that runtime and avoid package-manager downloads at startup.
- Treat this as a plan until the packaged executable passes clean-home, offline-start, provider, profile persistence, native-module, and child-process/worker checks.

## Licensing

Chimney and DSH are MIT licensed. Include their copyright/license texts and notices for every bundled third-party dependency.

## References

- [DSH releases](https://github.com/deepseek-ai/deepseek-harness/releases)
- [DSH npm versions and tags](https://www.npmjs.com/package/%40deepseek-ai/dsh?activeTab=versions)
- [Chimney package manifest and DSH compatibility ranges](https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/package.json)
- [Chimney standalone dependency manifest](https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/standalone/package.json)
- [Chimney standalone entry point](https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/standalone/entry.mjs)
- [Chimney standalone builder](https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/scripts/make-standalone-bundle.mjs)
- [Chimney license](https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/LICENSE)
- [DSH license](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/LICENSE)
