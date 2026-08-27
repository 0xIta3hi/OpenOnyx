# OpenOnyx

Local-first knowledge workspace for Markdown vaults. Notes stay as files on disk. Graph, Spaces (RAG), canvas, and an Obsidian-compatible plugin runtime ship in the desktop app. Apache-2.0. No product telemetry.

**Product tour and user guide:** run the site in [`website/`](website/) (`cd website && npm install && npm run dev`). Downloads: [Releases](https://github.com/OpenOnyx/OpenOnyx/releases).

[![License](https://img.shields.io/badge/license-Apache%202.0-111827?style=flat-square)](LICENSE)
![Electron 41](https://img.shields.io/badge/Electron-41-47848F?style=flat-square)
![Node 22+](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square)

## Download

Binaries are on the [GitHub Releases](https://github.com/OpenOnyx/OpenOnyx/releases) page (v1.0.4).

- **macOS:** `.dmg` / `.zip`. If Gatekeeper says the app is damaged or from an unidentified developer, right-click → Open, or `xattr -cr /Applications/OpenOnyx.app`.
- **Windows:** `.exe`. Signing is provided by [SignPath.io](https://signpath.io/) / [SignPath Foundation](https://signpath.org/).
- **Linux:** `.AppImage`, `.deb`, or Arch `.pkg.tar.zst`, or:

```bash
curl -fsSL https://raw.githubusercontent.com/OpenOnyx/OpenOnyx/main/scripts/install.sh | bash
```

## Develop

Requires **Node.js 22+** and npm 9+.

```bash
git clone https://github.com/OpenOnyx/OpenOnyx.git
cd OpenOnyx
npm install
npm run dev
```

That compiles Electron, starts Vite on `http://localhost:5173`, and launches the desktop app. If Electron’s postinstall download was skipped:

```bash
npm config set ignore-scripts false
npm rebuild electron
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Electron + Vite |
| `npm run lint` | `tsc --noEmit` |
| `npm run test` | Unit tests (excludes live plugin-bundle suite) |
| `npm run test:plugin-runtime` | Obsidian API runtime tests |
| `npm run test:all-checks` | Full contributor gate (types, tests, fixtures) |
| `npm run package` | Installers in `release/` |
| `npm run package:mac` / `package:win` / `package:linux` | Platform packages |

`package:linux` produces AppImage (and the Linux packager). Cross-platform release artifacts are built by `.github/workflows/release.yml` from a version tag.

Packaging templates (AUR, Homebrew, winget) live in [`packaging/`](packaging/).

## Cloud and AI (optional)

Local vaults, search, graph, embeddings, and local Spaces need no env vars.

For Spaces sync / auth, copy `.env.example` to `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Enable the `vector` extension, run [`supabase/schema.sql`](supabase/schema.sql), then paste the project URL and anon key (or use in-app database settings). Remote writing models (OpenAI / OpenRouter) are configured in the app, not required for local embeddings.

Live multiplayer editing uses Yjs and is currently under maintenance. Offline Spaces sync uses a queue plus last-write-wins for metadata; rejected edits are kept as `Note (conflict).md`.

## Layout

```
electron/     main process, IPC, vault filesystem
src/          renderer (editor, graph, canvas, Spaces, plugins)
supabase/     optional schema and edge functions
website/      marketing site and user docs
docs/         contributor docs (see docs/README.md)
scripts/      install, Pandoc, plugin fixtures
tests/        Vitest and compatibility scripts
packaging/    AUR / Homebrew / winget templates
```

## Docs

| Doc | Audience |
| --- | --- |
| [`website/`](website/) | Users: product, download, how-to |
| [`docs/README.md`](docs/README.md) | Index of remaining repo docs |
| [`docs/spaces.md`](docs/spaces.md) | Spaces indexing, RAG, sync internals |
| [`docs/obsidian-plugin-compatibility.md`](docs/obsidian-plugin-compatibility.md) | Plugin API matrix |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to send a change |
| [`SECURITY.md`](SECURITY.md) | Vulnerability reports |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Community rules |
| [`changelog.md`](changelog.md) | History |

## Contribute

Fork, branch from `main`, keep the change small, run `npm run lint` (and the tests that match what you touched). Open a PR against `OpenOnyx/OpenOnyx`. Details: [CONTRIBUTING.md](CONTRIBUTING.md).

Security issues: [SECURITY.md](SECURITY.md) — not the public issue tracker.

## License

[Apache License 2.0](LICENSE).
