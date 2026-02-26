import { getReminderSettings, setReminderSettings } from '../lib/storage.js';

// --- Reminder elements ---
const endOfDayEnabled = document.getElementById('endOfDayEnabled');
const endOfDayTime = document.getElementById('endOfDayTime');
const endOfDayMinHours = document.getElementById('endOfDayMinHours');
const endOfDayOptions = document.getElementById('endOfDayOptions');
const periodicEnabled = document.getElementById('periodicEnabled');
const periodicInterval = document.getElementById('periodicInterval');
const workStart = document.getElementById('workStart');
const workEnd = document.getElementById('workEnd');
const periodicOptions = document.getElementById('periodicOptions');
const saveRemindersBtn = document.getElementById('saveRemindersBtn');
const reminderSaveStatus = document.getElementById('reminderSaveStatus');

function showToast(message, type = 'error') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Status helper ---
function setStatus(el, message, type = '') {
  el.textContent = message;
  el.className = `status-msg ${type}`;
}

// --- Window controls ---
document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.close());

// --- Logout ---
document.getElementById('logoutBtn').addEventListener('click', async () => {
  document.getElementById('logoutBtn').disabled = true;
  await window.electronAPI.logout();
  window.electronAPI.close();
});

// --- Account info ---
async function loadAccountInfo() {
  const result = await chrome.storage.local.get(['memberName', 'memberEmail']);
  if (result.memberName) document.getElementById('memberName').textContent = result.memberName;
  if (result.memberEmail) document.getElementById('memberEmail').textContent = result.memberEmail;
}

// --- Auto-start ---
async function loadAutoStart() {
  const enabled = await window.electronAPI.getLoginItem();
  document.getElementById('autoStartEnabled').checked = enabled;
}

document.getElementById('autoStartEnabled').addEventListener('change', async (e) => {
  await window.electronAPI.setLoginItem(e.target.checked);
});

// --- Init ---
async function init() {
  await loadAccountInfo();
  await loadAutoStart();
  await loadReminderSettings();
}

// --- Reminder Settings ---
async function loadReminderSettings() {
  const settings = await getReminderSettings();

  endOfDayEnabled.checked = settings.endOfDay;
  endOfDayTime.value = settings.endOfDayTime;
  endOfDayMinHours.value = settings.endOfDayMinHours;
  periodicEnabled.checked = settings.periodic;
  periodicInterval.value = settings.periodicInterval;
  workStart.value = settings.workStart;
  workEnd.value = settings.workEnd;

  toggleSubOptions();
}

function toggleSubOptions() {
  endOfDayOptions.style.display = endOfDayEnabled.checked ? 'block' : 'none';
  periodicOptions.style.display = periodicEnabled.checked ? 'block' : 'none';
}

endOfDayEnabled.addEventListener('change', toggleSubOptions);
periodicEnabled.addEventListener('change', toggleSubOptions);

saveRemindersBtn.addEventListener('click', async () => {
  const settings = {
    endOfDay: endOfDayEnabled.checked,
    endOfDayTime: endOfDayTime.value,
    endOfDayMinHours: parseFloat(endOfDayMinHours.value) || 7,
    periodic: periodicEnabled.checked,
    periodicInterval: parseFloat(periodicInterval.value) || 2,
    workStart: workStart.value,
    workEnd: workEnd.value,
  };

  await setReminderSettings(settings);
  chrome.runtime.sendMessage({ type: 'updateReminders' });

  setStatus(reminderSaveStatus, 'Saved!', 'success');
  showToast('Reminder settings saved', 'success');
});

init();
