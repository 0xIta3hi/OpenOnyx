# OpenOnyx

[![License](https://img.shields.io/badge/License-Apache%202.0-111827)](LICENSE)
[![Release](https://img.shields.io/github/v/release/OpenOnyx/OpenOnyx?sort=semver)](https://github.com/OpenOnyx/OpenOnyx/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933)](package.json)

<img src="public/logos/logo-light.png" width="96" alt="OpenOnyx">

----

OpenOnyx is an open-source, local-first knowledge workspace. Notes are ordinary Markdown (and `.canvas`) files in a folder you choose. The desktop app adds a graph, Spaces (local RAG), and an [Obsidian-compatible](docs/obsidian-plugin-compatibility.md) plugin runtime. Cloud sync and remote models are optional. There is no product telemetry.

The source of truth for the product is this repository. The user-facing site and guide are at [openonyx.dev](https://openonyx.dev) (placeholder — update when the public URL is live). Source for that site is [`website/`](website/).

----

## To start using OpenOnyx

See [openonyx.dev](https://openonyx.dev) and download a build from [Releases](https://github.com/OpenOnyx/OpenOnyx/releases).

Current release is **v1.0.4**.

| Platform | Artifact |
| --- | --- |
| macOS | `.dmg` / `.zip`. If Gatekeeper blocks the app: right-click → Open, or `xattr -cr /Applications/OpenOnyx.app` |
| Windows | `.exe`. Signing by [SignPath.io](https://signpath.io/) / [SignPath Foundation](https://signpath.org/) |
| Linux | `.AppImage`, `.deb`, or Arch `.pkg.tar.zst` |

Linux installer:

```bash
curl -fsSL https://raw.githubusercontent.com/OpenOnyx/OpenOnyx/main/scripts/install.sh | bash
```

To run the website from this repo:

```bash
cd website
npm install
npm run dev
```

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

## Documentation

| | |
| --- | --- |
| [openonyx.dev](https://openonyx.dev) | User guide and product site |
| [docs/](docs/README.md) | Contributor docs |
| [docs/spaces.md](docs/spaces.md) | Spaces, RAG, sync internals |
| [docs/obsidian-plugin-compatibility.md](docs/obsidian-plugin-compatibility.md) | Plugin API matrix |
| [changelog.md](changelog.md) | Release history |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Fork, branch from `main`, keep the change small, run `npm run lint` and the tests that match what you touched, then open a pull request against `OpenOnyx/OpenOnyx`.

This project has a [Code of Conduct](CODE_OF_CONDUCT.md).

## Support

- Bugs and features: [GitHub Issues](https://github.com/OpenOnyx/OpenOnyx/issues)
- Security reports: [SECURITY.md](SECURITY.md) (not the public tracker)

## License

[Apache License 2.0](LICENSE).
