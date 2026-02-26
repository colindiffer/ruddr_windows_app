const { ipcRenderer } = require('electron');

window.electronAPI = {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  logout: () => ipcRenderer.invoke('logout'),
  onLoggedOut: (callback) => ipcRenderer.on('logged-out', callback),
  getLoginItem: () => ipcRenderer.invoke('get-login-item'),
  setLoginItem: (enabled) => ipcRenderer.invoke('set-login-item', enabled),
};

// Shim for chrome.storage.local
const storageLocal = {
  get: async (keys, callback) => {
    let result = {};
    if (keys === null || keys === undefined) {
      result = await ipcRenderer.invoke('store-get-all') || {};
    } else if (typeof keys === 'string') {
      const val = await ipcRenderer.invoke('store-get', keys);
      if (val !== undefined) result[keys] = val;
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        const val = await ipcRenderer.invoke('store-get', key);
        if (val !== undefined) result[key] = val;
      }
    } else if (typeof keys === 'object') {
      for (const key in keys) {
        const val = await ipcRenderer.invoke('store-get', key);
        result[key] = val !== undefined ? val : keys[key];
      }
    }
    if (callback) callback(result);
    return result;
  },
  set: async (items, callback) => {
    for (const key in items) {
      await ipcRenderer.invoke('store-set', key, items[key]);
    }
    if (callback) callback();
  },
  remove: async (keys, callback) => {
    if (Array.isArray(keys)) {
      for (const key of keys) {
        await ipcRenderer.invoke('store-delete', key);
      }
    } else {
      await ipcRenderer.invoke('store-delete', keys);
    }
    if (callback) callback();
  }
};

// Directly assign to window.chrome since contextIsolation is false
window.chrome = {
  storage: {
    local: storageLocal
  },
  cookies: {
    getAll: async (details, callback) => {
      const cookies = await ipcRenderer.invoke('cookies-get-all', details);
      if (callback) callback(cookies);
      return cookies;
    }
  },
  tabs: {
    create: (options) => {
      ipcRenderer.send('open-external', options.url);
    }
  },
  runtime: {
    sendMessage: (message) => {
      console.log('chrome.runtime.sendMessage called:', message);
    },
    openOptionsPage: () => {
      ipcRenderer.send('open-options');
    },
    onMessage: {
      addListener: (callback) => {}
    }
  },
  alarms: {
    create: (name, options) => {
      console.log('chrome.alarms.create called:', name, options);
    },
    clear: (name) => {
       console.log('chrome.alarms.clear called:', name);
    },
    onAlarm: {
      addListener: (callback) => {}
    }
  },
  notifications: {
    create: (id, options) => {
      new Notification(options.title || 'Ruddr', { body: options.message });
    }
  }
};
