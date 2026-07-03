document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initSnapSelects();
});

document.getElementById('aiProvider').addEventListener('change', toggleAISettings);
document.getElementById('btn-save').addEventListener('click', saveSettings);
document.getElementById('btn-export-all').addEventListener('click', exportAll);
document.getElementById('btn-clear-all').addEventListener('click', clearAll);
document.getElementById('btn-activate').addEventListener('click', activateLicense);
document.getElementById('btn-buy').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://ko-fi.com/s/97e8a39559' });
});
document.getElementById('btn-deactivate').addEventListener('click', deactivateLicenseUI);

async function loadSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');

  document.getElementById('autoExport').checked = settings.autoExport || false;
  document.getElementById('downloadImages').checked = settings.downloadImages !== false;
  document.getElementById('deepCapture').checked = settings.deepCapture || false;
  document.getElementById('suppressLazyWarning').checked = settings.suppressLazyWarning || false;
  document.getElementById('aiProvider').value = settings.aiProvider || '';
  document.getElementById('apiKey').value = settings.apiKey || '';
  document.getElementById('model').value = settings.model || '';
  document.getElementById('maxImages').value = settings.maxImages ?? 20;
  document.getElementById('includeMetadata').checked = settings.includeMetadata !== false;

  toggleAISettings();
  loadLicenseUI();
}

async function loadLicenseUI() {
  const license = await chrome.runtime.sendMessage({ action: 'getLicenseStatus' });

  if (license.isPro) {
    document.getElementById('license-free').classList.add('hidden');
    document.getElementById('license-pro').classList.remove('hidden');
    document.getElementById('license-status').innerHTML = '';
    // Enable all pro fields
    document.querySelectorAll('.pro-feature').forEach(el => {
      el.classList.remove('disabled-feature');
      const inputs = el.querySelectorAll('input, select, button');
      inputs.forEach(i => i.disabled = false);
    });
  } else {
    document.getElementById('license-free').classList.remove('hidden');
    document.getElementById('license-pro').classList.add('hidden');

    const usage = await chrome.runtime.sendMessage({ action: 'getUsage' });
    document.getElementById('license-status').innerHTML = `
      <p class="hint">Today's usage: ${usage.clips || 0}/5 clips · ${usage.prompts || 0}/1 prompts · ${usage.bibliographies || 0}/1 bibliographies</p>
    `;

    // Grey out pro features
    document.querySelectorAll('.pro-feature').forEach(el => {
      el.classList.add('disabled-feature');
      const inputs = el.querySelectorAll('input, select, button');
      inputs.forEach(i => i.disabled = true);
    });
  }
}

async function activateLicense() {
  const key = document.getElementById('license-key').value.trim();
  if (!key) return;

  const result = await chrome.runtime.sendMessage({ action: 'activateLicense', key });
  const msg = document.getElementById('license-msg');
  msg.textContent = result.message;
  msg.className = `status ${result.success ? 'success' : 'error'}`;
  msg.classList.remove('hidden');

  if (result.success) {
    loadLicenseUI();
  }
}

async function deactivateLicenseUI() {
  if (!confirm('Deactivate your Pro license on this device?')) return;
  await chrome.runtime.sendMessage({ action: 'deactivateLicense' });
  loadLicenseUI();
}

function toggleAISettings() {
  const provider = document.getElementById('aiProvider').value;
  const aiSettings = document.getElementById('ai-settings');
  aiSettings.classList.toggle('hidden', !provider);
}

async function saveSettings() {
  const settings = {
    autoExport: document.getElementById('autoExport').checked,
    downloadImages: document.getElementById('downloadImages').checked,
    deepCapture: document.getElementById('deepCapture').checked,
    suppressLazyWarning: document.getElementById('suppressLazyWarning').checked,
    aiProvider: document.getElementById('aiProvider').value,
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value.trim(),
    maxImages: parseInt(document.getElementById('maxImages').value) || 20,
    includeMetadata: document.getElementById('includeMetadata').checked
  };

  await chrome.storage.local.set({ settings });
  showSaveStatus('✓ settings locked in.', 'success');
}

async function exportAll() {
  const { clips = [] } = await chrome.storage.local.get('clips');

  if (clips.length === 0) {
    showDataStatus('nothing to export. the roll is empty.', 'error');
    return;
  }

  const data = JSON.stringify(clips, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `instant-snap-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showDataStatus(`exported ${clips.length} frames.`, 'success');
}

async function clearAll() {
  if (!confirm('wipe ALL clips? this can\'t be undone.')) return;
  if (!confirm('seriously though — all clips, gone forever. you sure?')) return;

  await chrome.storage.local.set({ clips: [] });
  showDataStatus('film roll wiped clean.', 'success');
}

function showSaveStatus(message, type) {
  const el = document.getElementById('save-status');
  el.textContent = message;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function showDataStatus(message, type) {
  const el = document.getElementById('data-status');
  el.textContent = message;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}
