# Oso — Object Storage Operator

A cross-platform desktop application for browsing and managing S3-compatible object storage (AWS S3, MinIO, Garage, and others). Built with [Wails](https://wails.io), [SvelteKit](https://kit.svelte.dev) (Svelte 5), [DaisyUI](https://daisyui.com), and Go.

## Features

- Browse buckets and objects with a native file-explorer feel
- Folder-first sorting with breadcrumb navigation
- Upload files with drag-and-drop and progress tracking
- Download files with configurable save location
- Copy, move, and delete objects and folders
- Multi-select operations
- Generate presigned URLs with configurable expiry
- Paginated listing — handles buckets with millions of objects
- Supports any S3-compatible backend (AWS S3, MinIO, Garage, etc.)
- Credentials saved locally in `~/.oso/config.json`

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Desktop   | [Wails v2](https://wails.io)            |
| Backend   | Go + aws-sdk-go-v2                      |
| Frontend  | SvelteKit + Svelte 5 Runes              |
| UI        | DaisyUI 5 + Tailwind CSS 4              |
| Icons     | HugeIcons                               |
| i18n      | Paraglide JS                            |

## Prerequisites

- [Go 1.24+](https://go.dev/dl/)
- [Node.js 20+](https://nodejs.org/) with [pnpm](https://pnpm.io/)
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

## Development

```bash
# Install frontend dependencies
cd frontend && pnpm install && cd ..

# Start live-reload dev server
wails dev
```

The app opens as a native window. A browser dev server also runs at `http://localhost:34115` for debugging Go methods from devtools.

## Build

```bash
wails build
```

The output binary is placed in `build/bin/`.

## Local Testing with MinIO

A Docker Compose setup is included to run a local MinIO instance.

```bash
docker compose up -d
```

Open the MinIO console at `http://localhost:9001` and log in with:

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
├── app.go                  # All Go/S3 backend logic
├── main.go                 # Wails app entry point
├── docker-compose.yaml     # Local MinIO for development
├── docker/
│   └── minio/              # MinIO init script
└── frontend/
    └── src/
        ├── lib/
        │   ├── components/ # Svelte UI components
        │   ├── stores/     # Svelte 5 runes state
        │   ├── utils/      # File icons, formatting
        │   └── wailsjs/    # Auto-generated Go bindings
        └── routes/         # SvelteKit pages
```

## License

MIT License — Copyright © 2026 StackQuest. See [LICENSE](LICENSE) for details.
