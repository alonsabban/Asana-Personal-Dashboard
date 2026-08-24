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
- `TaskTable` — sortable/filterable/groupable table with inline editing (due, assignee, status, description, subject, task name). Expandable rows show description + comments/subtasks side by side
- `BySubjectModule` — tasks grouped by subject taxonomy
- `TodayFocus` — overdue + today + this-week summary card
- `SetupGate` — first-run modal that collects and validates the Asana PAT
- `SubjectSettings` — modal to rename subjects and edit classification hints
- `Tutorial` — 7-step balloon tutorial triggered from topbar
- `MentionTextarea` — @mention typeahead used in comments and description editors

## Task name editing
Single-click a task name → inline text input to rename it (saves to Asana on Enter/blur).
Double-click a task name → expands the detail row.
Caret (▸) always toggles expand independently.

## AsanaTask type fields
gid, name, project, projectGid, due, completed, permalink, subject, track, createdBy, assignee, notes, status, statusFieldGid, statusOptions[], createdAt, section, sectionGid
