# OpenOnyx

<p align="center">
  <img width="1600" alt="OpenOnyx desktop workspace" src="docs/images/banner.webp" />
</p>

<p align="center">
  <strong>A local-first, AI-assisted knowledge workspace for Markdown vaults.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache%202.0-111827?style=flat-square"></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Local first" src="https://img.shields.io/badge/local--first-yes-10B981?style=flat-square">
</p>

OpenOnyx is a professional desktop knowledge management app built around plain Markdown files, Obsidian-style workflows, graph navigation, local semantic indexing, and optional cloud collaboration. It is designed for people who want ownership of their notes while still having a modern thinking layer for search, synthesis, writing assistance, and knowledge exploration.

The app is built with Electron, React, TypeScript, CodeMirror, D3, Tailwind CSS, Transformers.js, IndexedDB, and Supabase.

## Why OpenOnyx

OpenOnyx is for writers, researchers, engineers, students, and teams who want a serious knowledge base without surrendering their files to a proprietary silo.

| Principle | What it means |
| --- | --- |
| Local-first by default | Notes are normal files in normal folders. Core workflows work offline. |
| Markdown-native | Your writing stays portable, readable, and tool-friendly. |
| AI where it helps | Retrieval, suggestions, summaries, and inline writing tools are grounded in your vault. |
| Cloud when you choose | Supabase-backed sync, collaboration, and public Spaces are optional. |
| Plugin-aware | OpenOnyx targets Obsidian plugin compatibility through a tested runtime layer. |

## To start using OpenOnyx

Current release is **[v1.0.4](https://github.com/OpenOnyx/OpenOnyx/releases/tag/v1.0.4)**. Product docs: [openonyx.dev](https://openonyx.dev) (placeholder URL).

### macOS and Linux — one command

```bash
curl -fsSL https://raw.githubusercontent.com/OpenOnyx/OpenOnyx/main/scripts/install.sh | bash
```

That fetches the latest release and installs the matching package (`.dmg` on macOS; `.deb`, Arch, or AppImage on Linux).

### Or download the file

**macOS**

- Apple Silicon — [OpenOnyx-1.0.4-arm64.dmg](https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx-1.0.4-arm64.dmg)
- Intel — [OpenOnyx-1.0.4.dmg](https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx-1.0.4.dmg)

```bash
# Apple Silicon
curl -LO https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx-1.0.4-arm64.dmg

# Intel
curl -LO https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx-1.0.4.dmg
```

If Gatekeeper blocks the app: right-click → Open, or `xattr -cr /Applications/OpenOnyx.app`.

**Windows**

- Installer — [OpenOnyx.Setup.1.0.4.exe](https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx.Setup.1.0.4.exe)
- Portable — [OpenOnyx.1.0.4.exe](https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx.1.0.4.exe)

Signed by [SignPath.io](https://signpath.io/) / [SignPath Foundation](https://signpath.org/).

```powershell
Invoke-WebRequest -Uri https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx.Setup.1.0.4.exe -OutFile OpenOnyx.Setup.1.0.4.exe
```

**Linux**

- [OpenOnyx-1.0.4.AppImage](https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx-1.0.4.AppImage)
- Debian / Ubuntu — [openonyx_1.0.4_amd64.deb](https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/openonyx_1.0.4_amd64.deb)
- Arch — [openonyx-1.0.4-1-x86_64.pkg.tar.zst](https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/openonyx-1.0.4-1-x86_64.pkg.tar.zst)

```bash
# AppImage
curl -LO https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/OpenOnyx-1.0.4.AppImage
chmod +x OpenOnyx-1.0.4.AppImage
./OpenOnyx-1.0.4.AppImage

# Debian / Ubuntu
curl -LO https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/openonyx_1.0.4_amd64.deb
sudo dpkg -i openonyx_1.0.4_amd64.deb

# Arch
curl -LO https://github.com/OpenOnyx/OpenOnyx/releases/download/v1.0.4/openonyx-1.0.4-1-x86_64.pkg.tar.zst
sudo pacman -U openonyx-1.0.4-1-x86_64.pkg.tar.zst
```

Then open a folder. That folder is the vault.

## To start developing OpenOnyx

You need [Node.js](https://nodejs.org/) 22 or newer and npm 9+.

```bash
git clone https://github.com/OpenOnyx/OpenOnyx.git
cd OpenOnyx
npm install
npm run dev
```

That builds the Electron main process, starts Vite at `http://localhost:5173`, and launches the desktop app.

If Electron’s postinstall download was skipped:

```bash
npm config set ignore-scripts false
npm rebuild electron
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Desktop app + Vite |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run test` | Unit tests |
| `npm run test:plugin-runtime` | Plugin API runtime tests |
| `npm run test:all-checks` | Full contributor gate |
| `npm run package` | Local installers in `release/` |

Platform packages: `npm run package:mac`, `package:win`, `package:linux`. Tagged GitHub releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml). Distro templates are in [`packaging/`](packaging/).

Optional Spaces sync uses [`.env.example`](.env.example) → `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and [`supabase/schema.sql`](supabase/schema.sql). Local vaults, search, graph, and local Spaces need no environment variables.

The website is a separate Vite app:

```bash
cd website
npm install
npm run dev
```

## Website

User-facing docs and the product tour live at [openonyx.dev](https://openonyx.dev) (placeholder URL). Source is [`website/`](website/). Contributor technical notes stay in [`docs/`](docs/README.md).

## Contributing

We love our contributors. If you want to help, start with [CONTRIBUTING.md](CONTRIBUTING.md). Fork, branch from `main`, keep the change small, run `npm run lint` and the tests that match what you touched, then open a pull request against `OpenOnyx/OpenOnyx`.

This community has a [Code of Conduct](CODE_OF_CONDUCT.md). Please follow it.

Good first issues are labeled [`good first issue`](https://github.com/OpenOnyx/OpenOnyx/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Our Roadmap

What is shipped, what is next, and what is later: [docs/roadmap.md](docs/roadmap.md). The living backlog is [GitHub Issues](https://github.com/OpenOnyx/OpenOnyx/issues).

## Getting in touch

- [GitHub Issues](https://github.com/OpenOnyx/OpenOnyx/issues) — bugs and feature work
- [GitHub Discussions](https://github.com/OpenOnyx/OpenOnyx/discussions) — questions and ideas
- [openonyx@gmail.com](mailto:openonyx@gmail.com) — project contact
- Security reports: [SECURITY.md](SECURITY.md) (not the public tracker)

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Red%20Heart.png" alt="Red Heart" width="40" height="40" /> Contributors

<a href="https://github.com/OpenOnyx/OpenOnyx/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=OpenOnyx/OpenOnyx" alt="OpenOnyx contributors" />
</a>

## Support

- Bugs and features: [GitHub Issues](https://github.com/OpenOnyx/OpenOnyx/issues)
- Security: [SECURITY.md](SECURITY.md)

## License

[Apache License 2.0](LICENSE).
