# Personal Asana Dashboard

Your Asana tasks, gathered into one screen: what's overdue, what's due today,
what's coming, and a short ranked list of what to actually do first — plus notes
and quick links on the side.

Everything runs **on your own PC**. Your tasks and your Asana token never leave
it, and nobody else can see them.

---

## Getting started (non-technical — start here)

You need to do this **once**. About 5 minutes, most of it waiting.

### 1. Get the code

Go to <https://github.com/alonsabban/Asana-Personal-Dashboard> and download it
as a ZIP (green **Code** button → **Download ZIP**), then right-click the ZIP →
**Extract All**. Put the folder somewhere you'll find it again, like your
Documents.

### 2. Double-click `START-DASHBOARD.bat`

That's it. The launcher checks what's needed, sets it up the first time, starts
the dashboard, and opens it in your browser.

The **first** run takes a few minutes and scrolls a lot of text — that's normal,
it's downloading the pieces it needs. Later runs take about 10 seconds.

If it tells you **Node.js is missing**, it will open <https://nodejs.org> for
you. Download the big green **LTS** button, run the installer, click Next until
it finishes, then double-click `START-DASHBOARD.bat` again.

### 3. Paste your Asana token

The dashboard will ask for one before it shows anything — it can't read your
tasks without it. The on-screen instructions include the link, or go straight to
<https://app.asana.com/0/my-apps>, create a Personal Access Token, and paste it
in.

You only do this once. The token is checked with Asana immediately, so you'll
know right away if it didn't paste correctly.

### 4. Optional extras (⚙ gear icon)

Two things you can turn on, neither required:

- **Subjects** — your own categories for grouping tasks (see below).
- **AI classification** — if you have AWS Bedrock credentials, paste them in and
  the dashboard sorts new tasks into your subjects for you. They're checked
  against AWS on save, so you'll know immediately if they're wrong. Without them
  everything stays as "Other" and you sort by hand.

### 5. Add tasks by voice from your phone (optional)

1. Click the **🎤 Voice** button in the top bar of the dashboard.
2. Copy the personal link shown — open it on your phone (works from anywhere, no VPN needed).
3. Tap the mic and speak your task. Natural dates like "next Tuesday" are understood automatically.
4. Tasks land in your Asana the next time you hit **Refresh** on the dashboard.

The link is personal — treat it like a password. You can regenerate it any time from the same 🎤 button.

### 6. Set up subjects (optional)

After your tasks load, the dashboard offers to let you sort them into your own
categories ("Customer work", "Planning", whatever fits). **Entirely optional** —
skip it and everything just sits under "Other". You can set it up later from the
⚙ gear icon.

### Using it day to day

Double-click `START-DASHBOARD.bat` whenever you want the dashboard, and **keep
the window open** while you use it. Closing it stops the dashboard.

To stop it, press any key in that window.

---

## Good to know

- **Refreshing** — tasks refresh automatically once a day at **8:00 AM** your
  local time. Hit **Refresh** any time to pull immediately. The last update time
  is shown next to the button.
- **Your data is yours** — your token, subjects, and settings are stored in your
  own Windows user folder. Colleagues running their own copy see only their own
  tasks.
- **The address** is <http://localhost:3000>. `localhost` means "this computer" —
  the page isn't on the internet and nobody else can reach it.
- **Large task lists** — the dashboard loads up to 500 open tasks. Past that it
  tells you on screen rather than quietly showing a short list.

## If something goes wrong

- **"Node.js is not installed"** → see step 2 above.
- **Setup can't finish / download errors** → usually the corporate network
  blocking npm. Send the window text to Alon Sabban.
- **Blank page or won't load** → there's a `dashboard-log.txt` in the folder;
  send it over.
- **"Asana rejected that token"** → the token was cut off in copying, or it was
  revoked. Make a fresh one at <https://app.asana.com/0/my-apps>.

Questions or ideas: **Alon Sabban** — asabban@paloaltonetworks.com

---

## For developers

Next.js (App Router) + React + TypeScript. Asana is the first module; the layout
takes further data sources as additional cards.

```bash
npm install
npm run dev        # http://localhost:3000
```

### How the token is handled

The Asana PAT is **server-side only** and never reaches the browser. It is
resolved in [app/lib/settings.ts](app/lib/settings.ts) and
[app/lib/asana.ts](app/lib/asana.ts), in this order:

1. `~/.dashboard_settings.json` — written by the in-app setup gate (**normal path**)
2. the `ASANA_PAT` environment variable — useful for containers/CI
3. `~/.asana_pat` — legacy, kept for back-compat

New tokens are validated against `GET /users/me` before being persisted, so an
invalid token is never written to disk. When no token is configured,
`/api/asana/tasks` returns **HTTP 428** and the UI shows the setup gate instead
of an error.

### Per-user state (all outside the repo, in the user's home dir)

| File | Holds |
|---|---|
| `~/.dashboard_settings.json` | Asana PAT, AWS Bedrock credentials, display name |
| `~/.asana_subjects.json` | the user's subject taxonomy |
| `~/.asana_classifications.json` | cached AI classifications, one entry per task |

Colleagues therefore start clean, which is intended.

**Security model, stated plainly.** `~/.dashboard_settings.json` is plain JSON,
protected by the OS user-account boundary and nothing else. That is a real
boundary — another Windows user cannot read it — but anything running as *this*
account can. Encrypting it at rest would be theatre: the server decrypts it
unattended on every request, so the key would have to sit beside the ciphertext.

What the design does buy, and why it exists: secrets are no longer in a
repo-adjacent `.env.local` that gets zipped, emailed, or committed by accident;
they are validated before being stored; and they are never sent to the browser.
The API returns only `hasKeys` and a masked access key (`AKIA••••5XER`) — never
the secret. `.env.local` still works as a fallback for containers/CI.

### Task fetching

`getAsanaData()` in [app/lib/asana.ts](app/lib/asana.ts) requests
`completed_since=now` so Asana filters completed tasks server-side, then follows
`next_page.offset` (Asana caps `limit` at 100/page) up to `MAX_TASKS` — currently
**500**. On hitting that ceiling it sets `truncated: true` and the UI says so
rather than truncating silently. Raise or lower the one constant to taste.

The "Done (7d)" tile comes from a separate single-field query over a rolling
7-day window, since the main query no longer returns completed tasks.

### Optional AI classification

Credentials resolve in [app/lib/classify.ts](app/lib/classify.ts) via
`getAwsConfig()`: the settings file first, then `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `BEDROCK_MODEL_ID` from the
environment. Settings win so a value typed in the UI is never shadowed by a
stale `.env.local`. New credentials are verified with a real 1-token Bedrock
call before being written, and the errors are mapped to plain language (bad key
vs. missing IAM permission vs. model-not-in-region vs. network).

Bedrock is called **only for tasks not already in the classification cache**, so
a refresh with no new tasks costs nothing. Without credentials the app works
fine — everything lands under "Other" until subjects are configured.

Cache mutations go through `mutateCache()`, which serialises
read-modify-write cycles. Without it two concurrent refreshes each load the
cache, add their own entries, and the second write drops the first's — observed
in testing before the lock was added.

### Project layout

```
app/
  lib/asana.ts             server-side Asana client (token, fetching, pagination)
  lib/settings.ts          per-user config (PAT, display name)
  lib/subjects.ts          subject taxonomy
  lib/classify.ts          AWS Bedrock classification + on-disk cache
  api/settings/route.ts    GET status / POST validate+save PAT / DELETE clear
  api/asana/*              task, comment, subtask, project, user routes
  components/              React modules (SetupGate, DashboardShell, Asana, Notes, …)
  page.tsx                 provider + shell
  globals.css              theme + styles
```

To add a module: component under `app/components/`, server logic under
`app/lib/`, route under `app/api/`, then drop it into the grid.

### Security notes

- The app binds to `localhost` and has **no authentication** on its API routes.
  That is acceptable for a single-user local install and is the reason this is
  not deployed to a shared server: one running copy has one set of config files
  and therefore one identity. Multi-user hosting would need real auth and
  per-user storage first.
- Never commit `.env.local`. Token files live in the home directory, not the repo.
