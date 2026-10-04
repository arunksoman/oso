# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Oso (Object Storage Operator) is a desktop file explorer for S3-compatible storage (AWS S3, MinIO, Garage). It uses a Go backend on **Wails v3** (v3.0.0-beta.26) and a **SvelteKit + Svelte 5** frontend styled with DaisyUI 5 and Tailwind 4.

## Commands

Run these from the repo root unless noted. `wails3 task` runs the bundled Task runner, so a separate `task` install isn't needed.

```bash
wails3 dev                       # live-reload dev: generates bindings, runs Vite on :9245, launches app
wails3 build                     # production binary for host OS -> bin/oso(.exe)
wails3 task windows:package      # NSIS installer -> bin/oso-amd64-installer.exe
wails3 task darwin:package:universal
wails3 task linux:create:deb     # also linux:create:rpm, linux:create:appimage
wails3 task common:generate:bindings   # regenerate frontend/bindings after changing Go service methods/types
wails3 task common:update:build-assets # after editing build/config.yml (name, version, company)

go vet ./...
go test ./...                    # fast Go tests; single test: go test -run TestName ./...
CGO_ENABLED=0 go test -tags server ./...   # adds the tests that start a headless Wails app (needs frontend/dist)
wails3 task test                 # Go + frontend unit tests with the 95% coverage gates
wails3 task test:e2e             # Playwright against the server-mode build; needs `docker compose up -d`

cd frontend
pnpm run check                   # svelte-kit sync + svelte-check (type check)
pnpm run test                    # vitest; single file: pnpm exec vitest run src/lib/utils/format.test.ts
pnpm run test:coverage           # vitest with coverage thresholds (report in frontend/coverage)
pnpm run test:e2e                # playwright; single test: pnpm exec playwright test -g "creates a folder"
pnpm run lint                    # prettier --check + eslint
pnpm run format
```

- **Versioning** (`build/config.yml`): `info.version` must be numeric `X.Y.Z`, because NSIS rejects pre-release suffixes. `info.displayVersion` is the version shown in the side panel and may carry a suffix (e.g. `0.7.0-beta.1`). After editing either, run `common:update:build-assets`. `VERSION=...` in the environment stamps `-X main.version` into production builds; without it, `GetVersion()` reads `displayVersion`, then `version`, from the embedded config.
- **Tests** come in three layers, all gated in CI:
  - **Go** (`*_test.go` next to the code). S3 calls run against the in-memory `fakeS3` server in `testutil_test.go` (`newConnectedApp`), and `isolateHome` keeps tests away from the real `~/.oso`. `fakeS3` also keeps object headers (content type, metadata, tags) for the properties tests. `wails_app_test.go` is built only with `-tags server`: that tag selects the headless Wails implementation, so those tests run a real `application.App` (updater against a fake GitHub API, dialogs, HTTP asset serving, the settings window, broadcast events) on every OS without a display. Build it with `CGO_ENABLED=0`: with cgo on, Linux still links GTK and WebKit under the server tag. `scripts/go-coverage.mjs` runs the suite that way and fails below 95% statement coverage.
  - **Frontend unit** (`src/**/*.test.ts`; Vitest, happy-dom, `@testing-library/svelte`). `src/test/setup.ts` auto-mocks every binding in `$bindings/oso/app` and replaces `@wailsio/runtime`, resets `appState` before each test and cancels leftover timers; tests set binding results with `vi.mocked(...)` and deliver backend events with `emitEvent` from `src/test/helpers.ts`. `FileExplorer.test.ts` swaps the virtualizer for a stand-in because happy-dom has no layout. Thresholds are in `vite.config.ts`: 95% statements, functions and lines, 90% branches.
  - **End-to-end** (`frontend/e2e`, Playwright). `playwright.config.ts` starts two copies of the server-mode build (`bin/oso-server`), one connected to RustFS through `S3_*` and one unconfigured for the setup screen, each with its own temporary home directory. `e2e/s3.ts` seeds and inspects RustFS directly. Native file dialogs, windows and OS file drops do not exist in server mode, so uploads through the dialog or by dropping files are covered by the unit layers only. `OpenSettingsWindow` returns false there and the frontend opens `/settings` with `window.open`; `e2e/settings.ts` waits for that popup. `setup.spec.ts` runs serially and walks through the connection profiles.
- `pnpm run check` reports missing `$lib/paraglide/*` modules until a Vite build or dev run has generated `src/lib/paraglide`.
- Local RustFS for testing: `docker compose up -d` (single node, single disk, data in a named volume). The API is at `localhost:9000` and the console at `localhost:9001`. Credentials are `osodev` / `osodevpass`, region `us-east-1`, and the `oso-test` bucket is created automatically. The app can also skip the setup screen through the `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and `S3_REGION` environment variables.

## Architecture

### Go backend (package `main`, repo root)
- `main.go` creates the app in `newApplication`, which the tests also call. It registers a single service, `App`, and embeds `frontend/dist`. Its `init()` registers the typed events with `application.RegisterEvent[T]`; registration has to stay in `init` so the binding generator can discover it.
- `windows.go` owns the windows. `newMainWindow` creates the frameless explorer window (1020×740 minimum) with `EnableFileDrop`. `OpenSettingsWindow(section)` creates or focuses the second, frameless settings window at `/settings`; an already open window is sent `settings:navigate` instead of being reloaded. Closing the explorer closes the settings window. `nativeWindows` (`windows_native.go` / `windows_server.go`) is false under the `server` tag.
- `App` (in `app.go`) is the only bound service. Every exported method on `*App` across `app.go`, `profiles.go`, `windows.go`, `s3_*.go`, `dialogs.go` and `settings.go` becomes a frontend-callable function.
- Connection profiles (`profiles.go`) persist to `~/.oso/profiles.json` as `{activeId, profiles}`. `ServiceStartup` loads them and connects: `S3_*` environment variables first (a read-only profile with the ID `env` that is never written to disk), then the profile that was last active. A `config.json` from before profiles existed becomes the first profile. `Connect`, `SwitchProfile` and saving the active profile verify the new connection with `ListBuckets` before replacing the current one. Settings, including the theme, persist to `~/.oso/settings.json`.
- Every window has its own frontend state, so changes are broadcast: `SaveSettings` emits `settings:changed` and every profile or connection change emits `profiles:changed`.
- The S3 client uses path-style addressing and checksums "when required", for compatibility with non-AWS backends. Keep both settings when touching `newS3Clients`.
- Runtime access goes through `application.Get()`: `.Event.Emit(...)` and `.Dialog...`. There is no stored context.
- Wails v3 on Windows returns a "cancelled" error when the user closes a dialog. `ignoreCancel` in `dialogs.go` turns that into an empty result, which is what the frontend expects.
- Uploads emit `upload:folder:start`, `upload:progress`, `upload:done` and `upload:error`. The event payload structs live in `s3_upload.go`. `UploadFiles` with several paths that include a folder announces one batch with the total file count.
- Files dropped from the OS arrive in Go as `WindowFilesDropped` on the main window; `handleFilesDropped` forwards the paths as `files:dropped`, with the `data-drop-prefix` of the element they were dropped on, and the frontend starts the upload. Only elements with `data-file-drop-target` accept drops.
- `s3_properties.go` reads object properties with `HeadObject` plus `GetObjectTagging` (tag errors are ignored for backends without tagging) and edits content type and metadata by copying the object onto itself with `MetadataDirective: REPLACE`, which a single `CopyObject` allows up to 5 GiB.
- `DeleteBucket(name, deleteContents)` empties the bucket through `DeleteFolder` first when asked; S3 refuses to delete a non-empty bucket.
- Auto-update (`updater.go`) uses the Wails `app.Updater` with the GitHub Releases provider and the built-in update window. `updateAssetName` must match the asset names `release.yml` publishes (`oso-windows-amd64.exe`, `oso-linux-amd64`, `oso-macos-universal.zip`), which are verified against the `SHA256SUMS` asset. Builds with a pre-release version follow pre-releases; stable builds only see stable releases.
- Move is implemented as copy + delete, and folder operations recurse over `ListObjectsV2` pages.

### Go ↔ frontend contract
- `wails3 generate bindings` writes TypeScript to `frontend/bindings/` (committed). Components import calls from `$bindings/oso/app`, an alias defined in `svelte.config.js`.
- Typed events are wired through the `@wailsio/runtime` Vite plugin (`vite.config.ts`). A `/// <reference>` in `src/app.d.ts` pulls in the generated `eventdata.d.ts`.
- The frontend has its own hand-written interfaces in `src/lib/stores/appState.svelte.ts` (`S3Config`, `S3Object`, `AppSettings`, `ConnectionProfile`, `ObjectProperties`, …) that mirror the Go structs. Keep their JSON field names in sync with the Go `json:` tags.
- Window controls (`WindowControls.svelte`) use `Window` and `Application` from `@wailsio/runtime`. Drag regions use the CSS `--wails-draggable: drag | no-drag`. The settings window closes itself with `Window.Close()`.

### Frontend (`frontend/`)
- SvelteKit with `adapter-static` outputs to `frontend/dist`. `+layout.ts` sets `ssr = false` and `prerender = true`, and there are two routes, one per window. `src/routes/+page.svelte` is the explorer: it loads the shared state, registers the event listeners, and switches between `SetupScreen` and the main shell (Sidebar, TitleBar, Toolbar, FileExplorer and the properties panel, plus modals, the upload panel and toasts). `src/routes/settings/+page.svelte` is the settings window (`components/settings/`): a sidebar with the General, Connections and About sections. Add settings sections there, not as tabs or modals.
- All global state lives in one class-based runes store, `appState` (`src/lib/stores/appState.svelte.ts`). Components mutate it directly. Modals are toggled by `show*` flags or a target (`deleteBucketTarget`, `propertiesTarget`), listings reload through `refreshTrigger` and the bucket list through `bucketsTrigger`.
- Each window has its own `appState`. `src/lib/stores/sync.ts` loads the shared part (settings, profiles, connection) and follows `settings:changed` and `profiles:changed`; `appState.applyConnection` resets the navigation when the active profile changes. `openSettings(section)` opens the settings window.
- The sidebar has the connection switcher at the top and a delete button per bucket; `DeleteBucketModal` only enables delete once the bucket name is typed.
- `FileExplorer.svelte` coordinates the explorer subcomponents in `components/explorer/`. It handles paginated listing (continuation tokens with `settings.pageSize`), server-side search via `SearchObjects`, clipboard copy/cut/paste, keyboard shortcuts, uploads and drag and drop. Rows are virtualized with `@tanstack/svelte-virtual`. Rows are HTML5-draggable and folder rows are drop targets (move); the list and the folder rows also carry `data-file-drop-target` for files from the OS. The Wails runtime handles drags of type `Files`, so the row handlers only act while `draggedKeys` is set.
- i18n uses Paraglide (`messages/en.json`, `es.json`). Themes are DaisyUI `night` (default) and `light`, set through `data-theme` on `<html>`. Both are redefined in `app.css` with `themes: false` on the main plugin; re-enabling the built-in themes brings back rounded corners in production builds.

### Build / CI
- `Taskfile.yml` dispatches to `build/{windows,darwin,linux}/Taskfile.yml`, with shared tasks in `build/Taskfile.yml`. Mobile targets were removed on purpose. `wails3 update build-assets` recreates a gitignored `build/ios`.
- `build/config.yml` is the source of truth for product metadata. Info.plist, NSIS, nfpm and `windows/info.json` are generated from it.
- `.github/workflows/test.yml` runs on pull requests, on manual dispatch and when called by `build.yml`. Its unit job runs on Linux, Windows and macOS (Go tests with `-tags server` and the coverage gate, frontend tests with coverage thresholds; the Windows runner also vets the desktop build, the only one that needs neither cgo nor GTK, so files excluded by the `server` tag are compiled on pull requests); its end-to-end job runs Playwright on Linux against RustFS, started from `docker-compose.yaml`. It needs no Wails CLI or GTK packages.
- `.github/workflows/build.yml` runs on push to main (so on merge, not on PRs), on manual dispatch and when called by another workflow. It runs a check job and `test.yml`, and only then builds Linux (binary, deb, rpm), Windows (NSIS) and macOS (universal zip). `release.yml` runs on `v*` tags: it writes the tag version into `build/config.yml` and calls `build.yml`, so a release is published only when the tests and coverage gates pass. Linux builds need `libgtk-4-dev` and `libwebkitgtk-6.0-dev`.

## Project conventions
- **Svelte 5 runes only**: `$state`, `$derived`, `$effect`, `$props`. Don't use `let`-based reactivity, `$:` or `export let`.
- **Icons**: HugeIcons only, rendered through the local wrapper `$lib/components/Icon.svelte` (imported as `HugeiconsIcon`) with icons from `@hugeicons/core-free-icons`. Don't use other icon sets, emoji or custom SVGs, and don't guess icon names. Use the same icon for the same action everywhere:
  - Bucket `BucketIcon`, folder `Folder01Icon` / open `Folder02Icon`, new folder `FolderAddIcon`
  - Rename `Edit01Icon`, delete `Delete02Icon`, upload `Upload01Icon`, download `Download01Icon`, copy `Copy01Icon`, cut `Scissor01Icon`, move `ArrowDataTransferHorizontalIcon`, paste `FilePasteIcon`, clipboard `ClipboardIcon`
  - Search `Search01Icon`, parent folder `ArrowUp02Icon`, back `ArrowLeft02Icon`, refresh `Refresh01Icon`, settings `Settings01Icon`, presigned URL `Link03Icon`
  - Success `Tick01Icon`, connection error `WifiError02Icon`, warning `Alert02Icon`
  - Connection profile `CloudServerIcon`, switcher `UnfoldMoreIcon`, properties and about `InformationCircleIcon`, tag `Tag01Icon`, add `Add01Icon`, close or remove `Cancel01Icon`, show/hide secret `ViewIcon` / `ViewOffIcon`
  - File-type icons are mapped in `src/lib/utils/fileIcons.ts`; unknown types use `FileUnknownIcon`.
- **UI**: DaisyUI 5 component classes and theme colors (`bg-base-100`, `text-base-content`, `btn`, `modal`, …).
- **Scale**: assume buckets with millions of objects. Never list a whole bucket at once; paginate, lazy-load and keep heavy work in Go.
- When writing Svelte code, use the Svelte MCP server (`list-sections` → `get-documentation`, then `svelte-autofixer` until it reports no issues), as `frontend/AGENTS.md` asks.
