# Oso — Object Storage Operator

A cross-platform desktop application for browsing and managing S3-compatible object storage (AWS S3, MinIO, Garage, and others). Built with [Wails](https://wails.io), [SvelteKit](https://kit.svelte.dev) (Svelte 5), [DaisyUI](https://daisyui.com), and Go.

## Features

- Browse buckets and objects with a native file-explorer feel
- Folder-first sorting with breadcrumb navigation
- Upload files and folders by dropping them onto the window, with progress tracking
- Drag rows onto a folder to move them
- Download files with configurable save location
- Copy, move, and delete objects and folders
- Multi-select operations
- Generate presigned URLs with configurable expiry
- Object properties panel: content type, ETag, storage class, metadata and tags, with in-place editing of content type and metadata
- Create and delete buckets (deleting asks you to type the bucket name)
- Multiple connection profiles: switch between AWS, RustFS, Garage and other accounts from the sidebar
- Settings in their own window
- Paginated listing — handles buckets with millions of objects
- Supports any S3-compatible backend (AWS S3, MinIO, Garage, etc.)
- Connection profiles saved locally in `~/.oso/profiles.json`

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Desktop   | [Wails v3](https://v3.wails.io)         |
| Backend   | Go + aws-sdk-go-v2                      |
| Frontend  | SvelteKit + Svelte 5 Runes              |
| UI        | DaisyUI 5 + Tailwind CSS 4              |
| Icons     | HugeIcons                               |
| i18n      | Paraglide JS                            |
| Build     | [Task](https://taskfile.dev) (via `wails3 task`) |

## Prerequisites

- [Go 1.25+](https://go.dev/dl/)
- [Node.js 20+](https://nodejs.org/) with [pnpm](https://pnpm.io/)
- [Wails CLI v3](https://v3.wails.io/getting-started/installation/)
- Linux only: `libgtk-4-dev` and `libwebkitgtk-6.0-dev`

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.26
wails3 doctor
```

The build pipeline is defined in [Taskfile.yml](Taskfile.yml) and the platform Taskfiles under [build/](build/). `wails3 task` runs them with the Task runner bundled in the Wails CLI, so a separate `task` install is optional.

## Development

```bash
wails3 dev
```

This installs frontend dependencies, generates TypeScript bindings into `frontend/bindings/`, starts the Vite dev server on port 9245 and opens the app with live reload.

## Build

```bash
# Production binary for the current OS, written to bin/
wails3 build

# Platform packages
wails3 task windows:package          # NSIS installer (bin/oso-amd64-installer.exe)
wails3 task darwin:package:universal # Universal .app bundle
wails3 task linux:create:deb         # .deb (also linux:create:rpm, linux:create:appimage)
```

Set `VERSION=x.y.z` in the environment to stamp the version into the binary. App metadata (name, company, version) lives in [build/config.yml](build/config.yml). Keep `version` numeric (`X.Y.Z`) because Windows installers reject pre-release suffixes; put the full version such as `0.7.0-beta.1` in `displayVersion`, which is what the app shows. After changing it run `wails3 task common:update:build-assets` to regenerate Info.plist, NSIS and nfpm files.

## Local Testing with RustFS

A Docker Compose setup is included to run a local [RustFS](https://rustfs.com) instance (single node, single disk).

```bash
docker compose up -d
```

Open the RustFS console at `http://localhost:9001` and log in with:

| Field    | Value       |
|----------|-------------|
| Username | `osodev`    |
| Password | `osodevpass`|

Connect Oso using these values:

| Setting   | Value                    |
|-----------|--------------------------|
| Endpoint  | `http://localhost:9000`  |
| Access Key| `osodev`                 |
| Secret Key| `osodevpass`             |
| Region    | `us-east-1`              |

A bucket named `oso-test` is created automatically on first startup.

## Project Structure

```
oso/
├── app.go                  # App service: config, connection, version
├── s3_*.go                 # S3 operations (buckets, objects, upload, download)
├── dialogs.go              # Native file dialogs
├── main.go                 # Wails app entry point
├── Taskfile.yml            # Build pipeline entry point
├── build/                  # Build config, icons and platform Taskfiles
├── docker-compose.yaml     # Local RustFS for development
└── frontend/
    ├── bindings/           # Auto-generated Go bindings (wails3 generate bindings)
    └── src/
        ├── lib/
        │   ├── components/ # Svelte UI components
        │   ├── stores/     # Svelte 5 runes state
        │   └── utils/      # File icons, formatting
        └── routes/         # SvelteKit pages
```

## License

MIT License — Copyright © 2026 StackQuest. See [LICENSE](LICENSE) for details.
