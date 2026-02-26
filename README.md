# Ruddr Time Tracker - Windows App

This is a native Windows desktop application converted from the Ruddr Chrome Extension.

The extention can be founf at C:\Users\ColinDiffer\app\ruddrextention

## Architecture
- **Framework**: Electron
- **Main Process (`src/main/main.js`)**: Handles window management, native system integration, and IPC communication.
- **Preload (`src/main/preload.js`)**: A secure bridge that shims Chrome Extension APIs (`chrome.storage`, `chrome.cookies`, `chrome.tabs`, etc.) so the original extension code works without modification.
- **Renderer (`src/renderer/`)**: The original extension UI (HTML/CSS/JS).

## Setup & Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run in Development**:
   ```bash
   npm start
   ```
   *Note: DevTools will open automatically in development mode to help with debugging.*

## Building the App

To create a standalone Windows installer (`.exe`):
```bash
npm run build
```
The output will be in the `dist/` folder.

## Key Changes from Extension
- **Authentication**: When logging in, the app opens an internal window to capture Ruddr session cookies.
- **Storage**: Data is stored locally using `electron-store` instead of the browser's extension storage.
- **Links**: External links open in the default system browser.
