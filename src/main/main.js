const { app, BrowserWindow, ipcMain, shell, session, Tray, Menu, Notification } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

const store = new Store();
let mainWindow = null;
let tray = null;
let isQuitting = false;
let endOfDayTimer = null;

const RUDDR_BASE_URL = 'https://www.ruddr.io/api/workspace';
const CLOUD_FUNCTION_URL = 'https://europe-west2-ruddr-reporting.cloudfunctions.net/getRuddrApiKey';
const CLOUD_FUNCTION_SECRET = '0b62f8e167ae0e7b5019c994be1b9003052fbda661c17776dd59deb84d03ab74';
const KEY_CACHE_TTL = 24 * 60 * 60 * 1000;

async function getApiKeyForMain() {
  const cache = store.get('apiKeyCache');
  const now = Date.now();
  if (cache && cache.key && (now - cache.fetchedAt) < KEY_CACHE_TTL) return cache.key;
  const resp = await fetch(CLOUD_FUNCTION_URL, { headers: { 'Authorization': `Bearer ${CLOUD_FUNCTION_SECRET}` } });
  if (!resp.ok) throw new Error('Key fetch failed');
  const { key } = await resp.json();
  store.set('apiKeyCache', { key, fetchedAt: now });
  return key;
}

function scheduleEndOfDayReminder() {
  if (endOfDayTimer) { clearTimeout(endOfDayTimer); endOfDayTimer = null; }
  const settings = store.get('reminderSettings') || {};
  if (!settings.endOfDay) return;
  const [h, m] = (settings.endOfDayTime || '17:00').split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delayMs = target.getTime() - now.getTime();
  endOfDayTimer = setTimeout(async () => {
    await checkAndNotifyEndOfDay();
    scheduleEndOfDayReminder();
  }, delayMs);
}

async function checkAndNotifyEndOfDay() {
  const memberId = store.get('memberId');
  if (!memberId) return;
  const settings = store.get('reminderSettings') || {};
  const minHours = settings.endOfDayMinHours || 7;
  try {
    const apiKey = await getApiKeyForMain();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const params = new URLSearchParams({ memberId, dateOnOrAfter: todayStr, dateOnOrBefore: todayStr, limit: '100' });
    const response = await fetch(`${RUDDR_BASE_URL}/time-entries?${params}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const entries = (data.results || []).filter((e) => e.date === todayStr && e.member?.id === memberId);
    const totalMinutes = entries.reduce((sum, e) => sum + (e.minutes || 0), 0);
    if (totalMinutes < minHours * 60) {
      const totalHours = (totalMinutes / 60).toFixed(1);
      new Notification({
        title: 'Ruddr Time Tracker',
        body: `You've logged ${totalHours}h today. Don't forget to complete your timesheet!`,
      }).show();
    }
  } catch {
    // Silently fail
  }
}

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

  autoUpdater.on('update-available', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'available');
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'not-available');
    }
  });

  autoUpdater.on('update-downloaded', () => {
    tray.setToolTip('Ruddr Time Tracker — Update ready');
    tray.setContextMenu(buildTrayMenu(true));
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'downloaded');
    }
    new Notification({
      title: 'Ruddr Time Tracker',
      body: 'An update has been downloaded. Click "Restart to update" in the tray menu.',
    }).show();
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'error');
    }
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

  // Hide when focus is lost only in tray mode (mimics extension popup behaviour)
  mainWindow.on('blur', () => {
    if (!app.isPackaged && mainWindow.webContents.isDevToolsFocused()) return;
    if (mainWindow.isMinimized()) return;
    if (!store.get('minimizeToTray', false)) return; // normal window mode — don't hide on blur
    mainWindow.hide();
  });

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Single instance lock — if another instance tries to start, focus the existing window instead
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdater();
  scheduleEndOfDayReminder();

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
  ['memberId', 'memberName', 'memberEmail', 'pendingEmail', 'apiKeyCache', 'identityVerifiedAt'].forEach((key) => store.delete(key));

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
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', () => {
  if (app.isPackaged) autoUpdater.checkForUpdates();
});

ipcMain.on('update-reminders', () => {
  scheduleEndOfDayReminder();
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
