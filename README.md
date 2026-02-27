# Ruddr Time Tracker — Windows App

A native Windows desktop app for logging time in Ruddr, built with Electron. Lives in the system tray, works like the Chrome extension but as a standalone app — no browser needed.

---

## Features

- Log time, edit entries, run timers
- Submit and unsubmit your timesheet for the whole week in one click
- Runs as a regular window, or optionally minimizes to the system tray
- Launches at Windows startup automatically
- Auto-updates silently in the background

---

## Installing (for users)

Download the latest installer from:

**https://github.com/colindiffer/ruddr_windows_app/releases/latest**

> **Windows SmartScreen warning:** Because the app isn't code-signed, Windows will show
> "Windows protected your PC" on first install. Click **More info → Run anyway** to proceed.
> This is normal for internal unsigned apps.

After installing:
1. The Ruddr icon will appear in your system tray
2. Click it and enter your Ruddr email address
3. Click **Login at Ruddr** — a browser window will open
4. Log in to Ruddr — the window closes automatically and you're in

---

## First-time login

1. Click the tray icon to open the app
2. Enter your **Ruddr email address**
3. Click **Login at Ruddr**
4. Log in to Ruddr in the window that opens
5. The login window closes and the app loads your time entries

---

## Daily use

- **+ New Entry** to log time
- **Play button** next to an entry to start a timer on it
- **Submit Week** button (in the footer) to submit all entries for the current week — turns into **Unsubmit** once submitted
- The week bar shows the week's total hours and submission status (Not submitted / Submitted / Approved / Rejected)
- **Gear icon** to open Settings (logout, startup, tray behaviour)
- A tray icon is always available — right-click for Show / Quit

---

## Settings

Open via the **gear icon** in the top-right corner.

- **Account** — shows your name and email, with a Log Out button
- **Startup** — toggle whether the app launches when Windows starts
- **Minimize to tray** — when enabled, minimizing sends the app to the system tray instead of the taskbar, and it auto-hides when you click away
- **Reminders** — configure end-of-day and periodic nudge notifications

---

## Clearing saved data (to log in as a different user)

Delete this file:
```
C:\Users\<YourName>\AppData\Roaming\ruddr-windows-app\config.json
```
Then reopen the app from the tray.

---

## Development setup

**Requirements:** Node.js 18+

```bash
git clone https://github.com/colindiffer/ruddr_windows_app.git
cd ruddr_windows_app
npm install
npm start
```

DevTools opens automatically in dev mode.

---

## Building the installer locally

```bash
npm run build
```

Output: `dist/ruddr-windows-app Setup x.x.x.exe`

---

## Releasing a new version

1. Make your changes

2. Bump the version in `package.json`:
   ```json
   "version": "1.1.0"
   ```

3. Commit and push:
   ```bash
   git add -A
   git commit -m "Release v1.1.0"
   git push
   ```

4. Build the installer (`npm run publish` will fail on the GitHub upload step — that's fine, the `.exe` is built locally):
   ```bash
   npm run publish
   ```

5. Create the GitHub release and upload the installer via the `gh` CLI:
   ```bash
   gh release create v1.x.x \
     "dist/ruddr-windows-app Setup 1.x.x.exe" \
     "dist/ruddr-windows-app Setup 1.x.x.exe.blockmap" \
     dist/latest.yml \
     --title "v1.x.x" \
     --notes "Description of changes"
   ```

Installed copies will pick up the update within 4 hours and show a notification + "Restart to update" option in the tray menu.

---

## Architecture

| File | Purpose |
|------|---------|
| `src/main/main.js` | Main process — window management, tray, IPC, auto-update, cookie handling |
| `src/main/preload.js` | Shims Chrome extension APIs so the original extension code runs unchanged |
| `src/renderer/index.html` | Main popup UI |
| `src/renderer/popup.js` | Main popup logic |
| `src/renderer/options/` | Settings window |
| `src/renderer/lib/api.js` | Ruddr API calls |
| `src/renderer/lib/storage.js` | Local storage helpers (via electron-store) |

**Key technical decisions:**
- `webSecurity: false` — allows the renderer to call the Ruddr API and GCP Cloud Function from a `file://` origin
- `frame: false` — custom frameless window with drag region and window controls
- `electron-store` — replaces `chrome.storage.local` for persistent data
- `session.defaultSession` — shared cookie jar across the main and login windows
- `electron-updater` — auto-update via GitHub Releases
