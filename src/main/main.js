const { app, BrowserWindow, ipcMain, shell, session, Tray, Menu, Notification } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

const store = new Store();
let mainWindow = null;
let tray = null;
let isQuitting = false;

// --- Window position (above tray icon) ---
function getWindowPosition() {
  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y - windowBounds.height - 4);
  return { x, y };
}

function showWindow() {
  const { x, y } = getWindowPosition();
  mainWindow.setPosition(x, y, false);
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function buildTrayMenu(updateReady = false) {
  const template = [
    { label: 'Show Ruddr', click: () => showWindow() },
    { type: 'separator' },
  ];
  if (updateReady) {
    template.push({ label: 'Restart to update', click: () => autoUpdater.quitAndInstall() });
    template.push({ type: 'separator' });
  }
  template.push({ label: 'Quit', click: () => { isQuitting = true; app.quit(); } });
  return Menu.buildFromTemplate(template);
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../renderer/icons/icon16.png'));
  tray.setToolTip('Ruddr Time Tracker');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => toggleWindow());
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    tray.setToolTip('Ruddr Time Tracker — Update ready');
    tray.setContextMenu(buildTrayMenu(true));
    new Notification({
      title: 'Ruddr Time Tracker',
      body: 'An update has been downloaded. Click "Restart to update" in the tray menu.',
    }).show();
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
  });

  // Check on startup after a short delay, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates(), 10000);
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    show: false, // start hidden — tray click reveals it
    skipTaskbar: store.get('minimizeToTray', false), // only skip taskbar if minimizing to tray
    icon: path.join(__dirname, '../renderer/icons/icon128.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Hide instead of close when X is clicked (live in tray)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Hide when focus is lost (behaves like the extension popup)
  mainWindow.on('blur', () => {
    if (!app.isPackaged && mainWindow.webContents.isDevToolsFocused()) return;
    if (mainWindow.isMinimized()) return; // minimized to taskbar — don't hide
    mainWindow.hide();
  });

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdater();

  // Enable auto-start by default on first packaged launch
  if (app.isPackaged && !store.get('autoStartSet')) {
    app.setLoginItemSettings({ openAtLogin: true });
    store.set('autoStartSet', true);
  }

  // Show window on first launch
  showWindow();
});

// Don't quit when all windows are closed — app lives in tray
app.on('window-all-closed', () => {});

// IPC handlers for storage (replacing chrome.storage)
ipcMain.handle('store-get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store-get-all', () => {
  return store.store;
});

ipcMain.handle('store-set', (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle('store-delete', (event, key) => {
  store.delete(key);
});

ipcMain.on('open-external', (event, url) => {
  if (url.includes('ruddr.io')) {
    const loginWin = new BrowserWindow({
      width: 800,
      height: 600,
      title: 'Ruddr Login',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    loginWin.loadURL(url);

    // Close login window when user is logged in
    const checkLogin = setInterval(async () => {
      const cookies = await session.defaultSession.cookies.get({ url: 'https://www.ruddr.io/' });
      const hasSession = cookies.some((c) => c.name === 'session');
      const hasSessionSig = cookies.some((c) => c.name === 'session.sig');
      if (hasSession && hasSessionSig) {
        clearInterval(checkLogin);
        setTimeout(() => {
          loginWin.close();
          showWindow();
        }, 2000);
      }
    }, 2000);

    loginWin.on('closed', () => clearInterval(checkLogin));
  } else {
    shell.openExternal(url);
  }
});

ipcMain.on('open-options', () => {
  const optionsWin = new BrowserWindow({
    width: 520,
    height: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
    },
  });
  optionsWin.loadFile(path.join(__dirname, '../renderer/options/options.html'));
  optionsWin.on('closed', () => showWindow());
});

ipcMain.handle('logout', async () => {
  // Clear all user data from store
  ['memberId', 'memberName', 'memberEmail', 'pendingEmail', 'apiKeyCache'].forEach((key) => store.delete(key));

  // Clear Ruddr session cookies
  for (const url of ['https://www.ruddr.io', 'https://ruddr.io']) {
    const cookies = await session.defaultSession.cookies.get({ url });
    for (const cookie of cookies) {
      await session.defaultSession.cookies.remove(url, cookie.name);
    }
  }

  // Tell the main window to go back to setup
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('logged-out');
  }
});

ipcMain.handle('cookies-get-all', async (event, details) => {
  return session.defaultSession.cookies.get(details);
});

ipcMain.handle('get-login-item', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-login-item', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
});

ipcMain.handle('get-minimize-to-tray', () => {
  return store.get('minimizeToTray', false);
});

ipcMain.handle('set-minimize-to-tray', (event, enabled) => {
  store.set('minimizeToTray', enabled);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSkipTaskbar(enabled);
  }
});

ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win === mainWindow) {
    if (store.get('minimizeToTray', false)) {
      win.hide();
    } else {
      win.minimize();
    }
  } else {
    win.minimize();
  }
});

// Main window hides to tray; other windows (options) close normally
ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win === mainWindow) {
    win.hide();
  } else {
    win.close();
  }
});
