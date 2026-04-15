# Oso (Object Storage Operator) – Agent Prompt

You are building a **desktop application** called **Oso (Object Storage Operator)**.

---

## Tech Stack

- Frontend: **SvelteKit (Svelte 5 with Runes syntax ONLY) + DaisyUI**
- Backend: **Go (Wails)**
- Storage: **S3-compatible object storage (AWS S3, MinIO, etc.)**

---

## Svelte 5 Runes Requirement (MANDATORY)

You MUST use **Svelte 5 runes syntax** everywhere.

### Rules:
- Use `$state` instead of `let` for reactive state
- Use `$derived` instead of reactive `$:` statements
- Use `$effect` for side effects
- Use `$props` for props handling
- DO NOT use legacy Svelte syntax

### Example:

    <script>
      const count = $state(0);

      const doubled = $derived(count * 2);

      $effect(() => {
        console.log("Count changed:", count);
      });
    </script>

Any usage of old syntax like:
- `let count = 0`
- `$: doubled = ...`

is NOT allowed.

---

## Core Principles

1. **Performance First**
   - Buckets can contain millions of objects.
   - Avoid loading everything at once.
   - Use pagination, lazy loading, and virtual scrolling.

2. **File Explorer UX**
   - UI should behave like a native file explorer (Windows/macOS/Linux).
   - Folder-first sorting.
   - Breadcrumb navigation.
   - Keyboard navigation (optional but preferred).

3. **Separation of Concerns**
   - Go handles S3 interactions.
   - SvelteKit handles UI and state.
   - Use clear API contracts between frontend and backend.

4. **Resilience**
   - Handle network failures gracefully.
   - Show retries and meaningful errors.

---

## App Initialization

### Credential Handling

- On app startup:
  1. Check environment variables:
     - `S3_ENDPOINT`
     - `S3_ACCESS_KEY`
     - `S3_SECRET_KEY`
  2. If missing:
     - Show a **setup screen**
     - Allow user to input credentials
     - Option to save securely (local encrypted storage preferred)

- Validate credentials before proceeding.

---

## Main UI Layout

### Layout Structure

- Sidebar:
  - List of buckets
- Main Panel:
  - File explorer view
- Top Bar:
  - Breadcrumb navigation
  - Actions (upload, refresh, settings)

---

## Features

### 1. Bucket Listing

- Fetch and display all buckets.
- Clicking a bucket opens it in explorer view.

---

### 2. File Explorer (Core Feature)

#### Behavior

- Mimic native file explorer:
  - Show folders first, then files
  - Support nested navigation
  - Breadcrumb navigation

#### Data Handling

- Use:
  - Pagination (limit + continuation token)
  - Lazy loading on scroll
  - Avoid fetching full metadata initially

#### File Stats (Toggleable)

- Size
- Last modified
- Type

- Add a toggle:
  - "Show details" ON/OFF
  - When OFF → minimal lightweight listing

---

### 3. Upload

- Upload single/multiple files
- Show progress bar
- Support drag-and-drop
- Handle large files (multipart upload if possible)

---

### 4. Download

- Default download location: system Downloads folder

#### Settings:
- Configurable default path
- Toggle:
  - "Ask before download" (ON by default)

#### Behavior

- If toggle ON:
  - Show file picker dialog before download
- If OFF:
  - Download directly to default location

---

### 5. Copy / Move

- Copy:
  - Between buckets or folders
- Move:
  - Implement as copy + delete

- Should support:
  - Multi-select operations
  - Background task with progress

---

### 6. Delete

- Delete:
  - Files
  - Folders (recursive)

#### Features:
- Multi-select delete
- Confirmation dialog
- Bulk delete optimization

---

### 7. Presigned URL

- Generate presigned URL for selected file

#### Options:
- Expiry duration (default: 1 hour)

- Copy to clipboard automatically

---

## Performance Optimizations

- Use **virtualized list rendering**
- Fetch objects using:
  - `ListObjectsV2` with continuation tokens
- Debounce UI updates
- Avoid blocking UI during large operations
- Use background workers (Go routines via Wails)

---

## State Management (Svelte 5 Runes)

- Maintain using `$state`:
  - Current bucket
  - Current path (prefix)
  - Pagination state
  - Selected items

---

## Error Handling

- Show user-friendly messages:
  - Network errors
  - Permission issues
  - Invalid credentials

- Retry mechanism for failed operations

---

## Settings Page

- S3 credentials (editable)
- Default download location
- Toggle:
  - Ask before download
  - Show file details

---

## Nice-to-Have (Optional Enhancements)

- Search within bucket (prefix-based)
- File preview (images, text)
- Recent files
- Dark/light mode toggle
- Drag-and-drop between folders

---

## Deliverables

- Clean modular code
- Reusable components
- Strict use of **Svelte 5 runes syntax**
- Well-defined API between Go and Svelte
- Focus on scalability and responsiveness

---

# Oso (Object Storage Operator) – Icon System

The application MUST use **HugeIcons** consistently across the entire UI.

All icons must be rendered using:

    <HugeiconsIcon icon={IconName} />

Do NOT use any other icon library, emoji, or custom SVG.

---

## Folder Icons
- Bucket:
    <HugeiconsIcon icon={BucketIcon} />

- Folder:
    <HugeiconsIcon icon={Folder01Icon} />

- Folder Open:
    <HugeiconsIcon icon={Folder02Icon} />

- Add Folder:
    <HugeiconsIcon icon={FolderAddIcon} />

---

## File Operations

- Edit / Rename:
    <HugeiconsIcon icon={Edit01Icon} />

- Delete / Bin:
    <HugeiconsIcon icon={Delete02Icon} />

- Upload:
    <HugeiconsIcon icon={Upload01Icon} />

- Download:
    <HugeiconsIcon icon={Download01Icon} />

- Copy:
    <HugeiconsIcon icon={Copy01Icon} />

- Cut:
    <HugeiconsIcon icon={Scissor01Icon} />

- Move:
    <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} />

- Paste File:
    <HugeiconsIcon icon={FilePasteIcon} />

- Clipboard:
    <HugeiconsIcon icon={ClipboardIcon} />

---

## Navigation & UI

- Search:
    <HugeiconsIcon icon={Search01Icon} />

- Go to Parent Folder:
    <HugeiconsIcon icon={ArrowUp02Icon} />

- Back:
    <HugeiconsIcon icon={ArrowLeft02Icon} />

- Refresh:
    <HugeiconsIcon icon={Refresh01Icon} />

- Settings:
    <HugeiconsIcon icon={Settings01Icon} />

---

## Link Icon

- presigned URL / share link:
    <HugeiconsIcon icon={Link03Icon} />

## Status & Feedback

- Success:
    <HugeiconsIcon icon={Tick01Icon} />

- Connection Error:
    <HugeiconsIcon icon={WifiError02Icon} />

- Alert / Warning:
    <HugeiconsIcon icon={Alert02Icon} />

---

## File Type Icons

- PPT:
    <HugeiconsIcon icon={Ppt02Icon} />

- DOC:
    <HugeiconsIcon icon={Doc02Icon} />

- Excel:
    <HugeiconsIcon icon={Xls02Icon} />

- Video:
    <HugeiconsIcon icon={FileVideoIcon} />

- Image:
    <HugeiconsIcon icon={FileImageIcon} />

- Code:
    <HugeiconsIcon icon={FileCodeCornerIcon} />

- Executable:
    <HugeiconsIcon icon={FileDigitIcon} />

- Music:
    <HugeiconsIcon icon={FileMusicIcon} />

- ZIP:
    <HugeiconsIcon icon={FileZipIcon} />

- 7z:
    <HugeiconsIcon icon={FileZipIcon} />

- RAR:
    <HugeiconsIcon icon={Rar02Icon} />

- RAW:
    <HugeiconsIcon icon={Raw02Icon} />

- SVG:
    <HugeiconsIcon icon={Svg02Icon} />

- CSV:
    <HugeiconsIcon icon={Csv02Icon} />

- PDF:
    <HugeiconsIcon icon={Pdf02Icon} />

- TXT:
    <HugeiconsIcon icon={Txt02Icon} />

- Archive (generic):
    <HugeiconsIcon icon={FileArchiveIcon} />

- Unknown:
    <HugeiconsIcon icon={FileUnknownIcon} />

---

## File Type Mapping Rules

- Code-like files:
  - `.json`, `.js`, `.ts`, `.py`, `.yaml`, `.yml`, `.md`
  → Use:
        <HugeiconsIcon icon={FileCodeCornerIcon} />

- Text-like files:
  - `.txt`, `.log`
  → Use:
        <HugeiconsIcon icon={Txt02Icon} />

- Archive files:
  - `.zip`, `.rar`, `.7z`, `.tar`, `.gz`
  → Use appropriate archive icon (or fallback to `FileArchiveIcon`)

- If exact type exists above → use mapped icon

- If type is unknown or unsupported:
  → Use:
        <HugeiconsIcon icon={FileUnknownIcon} />

---

## Consistency Rules

- Always use `<HugeiconsIcon />`
- Maintain consistent icon size across:
  - Sidebar
  - File list
  - Toolbar
- Do not mix multiple icon styles
- Icons must align visually with text (baseline alignment)
- Avoid unnecessary icon usage (keep UI clean)

---

## Invalid Usage

- Mixing icon libraries
- Using emojis as icons
- Guessing icon names not defined above
- Inconsistent icon usage for same action

## Important Notes

- Do NOT load entire bucket contents at once.
- Always assume large-scale datasets.
- Prioritize UX similar to native file explorers.
- Keep UI responsive even during heavy operations.
- Any code not using Svelte 5 runes should be considered invalid.
