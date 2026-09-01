# Asana Personal Dashboard

## What this repo is
The Personal Asana Dashboard. All development happens here. This is the single source of truth — edit, commit, and push directly from this folder.

GitHub: https://github.com/alonsabban/Asana-Personal-Dashboard

## What the app is
A personal productivity dashboard that pulls all Asana tasks assigned to the user across all workspaces into one place. Built with Next.js (App Router), TypeScript, plain CSS. No UI library.

## How colleagues use it
1. Install Node.js via Company Portal
2. `git clone https://github.com/alonsabban/Asana-Personal-Dashboard.git`
3. Double-click `START-DASHBOARD.bat` — handles everything else (npm install, build, browser open)
4. On first run the app shows a setup screen asking for their Asana PAT — entered in the browser, stored in `~/.dashboard_settings.json` on their machine, never committed

## Access control
Private GitHub repo. Alon invites colleagues by GitHub username (repo → Settings → Collaborators). No Cognito, no auth layer needed — private repo IS the access control.

## Key components
- `AsanaProvider` — shared data context, fetches on load
- `TaskTable` — sortable/filterable/groupable table with inline editing (due, assignee, status, description, subject, task name). Expandable rows show description + comments/subtasks side by side. Checkbox column selects tasks for bulk delete; hover reveals a per-row trash button for single delete
- `BySubjectModule` — tasks grouped by subject taxonomy
- `TodayFocus` — overdue + today + this-week summary card
- `SetupGate` — first-run modal that collects and validates the Asana PAT
- `SubjectSettings` — modal to rename subjects and edit classification hints
- `Tutorial` — 7-step balloon tutorial triggered from topbar
- `MentionTextarea` — @mention typeahead used in comments and description editors
- `DashboardHeader` — top bar; imports `APP_VERSION` from `app/version.ts` and shows it as a version badge
- `AccomplishmentsReport` — "Report" button in topbar; generates an AI executive summary of recently completed/in-progress tasks. User picks a time range (1 week / 2 weeks / 1 month), filters by status, and AWS Bedrock writes a structured report grouped by subject (one bullet block per subject, ordered completed → in-progress → planned). Includes a date-stamped period header and copy buttons. API: GET/POST `/api/asana/accomplishments`; summary function: `generateAccomplishmentsSummary()` in `app/lib/classify.ts`
- `BulkAddTasks` — "+ Bulk Add" button in topbar; lets user describe multiple tasks in free text. Bedrock parses the text against the live project/section list (resolving names to GIDs), flags any fields it couldn't determine, then shows an editable review card per task — unclear fields highlighted in orange. User resolves any ambiguities and confirms before tasks are created in Asana. API: POST `/api/asana/bulk-parse`; parse function: `parseBulkTasks()` in `app/lib/classify.ts`

## Task name editing
Single-click a task name → inline text input to rename it (saves to Asana on Enter/blur).
Double-click a task name → expands the detail row.
Caret (▸) always toggles expand independently.

## Task deletion
- Hover a task row → trash button (🗑) appears at the end of the task name → single-task delete with confirmation
- Checkbox in the leftmost column → selects tasks for bulk delete → "Delete N tasks" action bar appears above the table → confirmation dialog lists task names before deleting
- Checkbox does NOT complete tasks — completion is done via the status column inline editor
- Backend: `deleteTask()` in `app/lib/asana.ts`, DELETE `/api/asana/task/[gid]`

## Version badge
`app/version.ts` exports `APP_VERSION`. Shown as `V1.x` in the topbar. Increment the number manually in that file with every commit that changes the app.

## AsanaTask type fields
gid, name, project, projectGid, due, completed, permalink, subject, track, createdBy, assignee, notes, status, statusFieldGid, statusOptions[], createdAt, section, sectionGid
