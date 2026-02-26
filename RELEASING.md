# How to Release a New Version

## Prerequisites
You need a GitHub Personal Access Token with `repo` scope.

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Give it a name (e.g. `ruddr-publish`), tick the **repo** scope
4. Copy the token somewhere safe — you'll need it each time you publish

---

## Steps to Release

1. **Make your changes** to the code

2. **Bump the version** in `package.json`:
   ```json
   "version": "1.1.0"
   ```

3. **Commit and push** your changes:
   ```bash
   git add -A
   git commit -m "Release v1.1.0"
   git push
   ```

4. **Publish** (builds the installer and uploads it to GitHub Releases):
   ```bash
   GH_TOKEN=your_token_here npm run publish
   ```

5. Done — the release will appear at:
   https://github.com/colindiffer/ruddr_windows_app/releases

   Installed copies will check for the update within 4 hours and notify the user via a Windows notification and the tray menu.

---

## Sharing with New Users

Send them the direct download link:
```
https://github.com/colindiffer/ruddr_windows_app/releases/latest/download/ruddr-windows-app%20Setup%201.0.0.exe
```

> **Note:** Windows will show a SmartScreen warning ("Windows protected your PC") because the
> installer is not code-signed. Users need to click **More info → Run anyway** to install.
> This is normal for unsigned internal apps.

---

## Development

```bash
npm start        # Run in development mode (DevTools opens automatically)
npm run build    # Build installer locally without publishing
```

Installed at: `C:\Users\ColinDiffer\internal_projects\ruddr_windows_app`
GitHub repo:   https://github.com/colindiffer/ruddr_windows_app
