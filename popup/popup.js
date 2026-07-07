document.addEventListener('DOMContentLoaded', init);

let currentClips = [];

async function init() {
  await updateClipCount();
  await updateUsageInfo();
  await updateAutoCaptureIndicator();
  bindEvents();
}

async function updateUsageInfo() {
  const license = await chrome.runtime.sendMessage({ action: 'getLicenseStatus' });
  const el = document.getElementById('usage-info');

  if (license.isPro) {
    el.textContent = 'pro \u2014 unlimited exposures';
    el.style.color = '#6dd48e';
  } else {
    const usage = await chrome.runtime.sendMessage({ action: 'getUsage' });
    const remaining = 5 - (usage.clips || 0);
    el.textContent = `free: ${remaining} snaps left today`;
    if (remaining <= 1) el.style.color = '#e85d5d';
  }
}

function bindEvents() {
  document.getElementById('btn-snap').addEventListener('click', snapPage);
  document.getElementById('btn-snap-selection').addEventListener('click', snapSelection);
  document.getElementById('btn-library').addEventListener('click', showLibrary);
  document.getElementById('btn-back').addEventListener('click', showCapture);
  document.getElementById('btn-back-detail').addEventListener('click', showLibrary);
  document.getElementById('btn-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('btn-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });
}

async function snapPage() {
  const btn = document.getElementById('btn-snap');
  btn.disabled = true;
  btn.textContent = 'focusing...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const settingsResponse = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const settings = settingsResponse.settings || {};

    // Check page info for warnings
    let pageInfo;
    try {
      pageInfo = await chrome.tabs.sendMessage(tab.id, { action: 'checkPage' });
    } catch (e) {
      pageInfo = {};
    }

    // Warn about lazy loading if not suppressed
    if (pageInfo.isLazyLoaded && !settings.suppressLazyWarning && !settings.deepCapture) {
      btn.textContent = 'snap this page';
      btn.disabled = false;
      showLazyWarning(tab, settings);
      return;
    }

    btn.textContent = settings.deepCapture ? 'deep exposure...' : 'exposing...';

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractContent',
      options: {
        deepCapture: settings.deepCapture || false,
        maxImages: settings.maxImages || 20
      }
    });

    if (response.error) {
      showStatus(response.message, 'error');
      btn.disabled = false;
      btn.textContent = 'snap this page';
      return;
    }

    // Show any warnings
    if (response.warnings && response.warnings.length > 0) {
      showStatus(response.warnings[0], 'error');
    }

    const result = await chrome.runtime.sendMessage({ action: 'saveClip', data: response });

    if (result.success) {
      showStatus('snapped. added to the roll.', 'success');
      await updateClipCount();
      await updateUsageInfo();
    } else if (result.limitReached) {
      showStatus(result.error, 'error');
    } else {
      showStatus(result.error || 'failed to save', 'error');
    }
  } catch (err) {
    showStatus('could not capture page. try refreshing.', 'error');
    console.error(err);
  }

  btn.disabled = false;
  btn.textContent = 'snap this page';
}

function showLazyWarning(tab, settings) {
  const statusEl = document.getElementById('snap-status');
  statusEl.innerHTML = `
    <div style="text-align:left;font-size:12px;">
      this page lazy-loads content. capture may be partial.<br><br>
      <button id="lazy-proceed" style="margin-right:6px;padding:4px 10px;border-radius:6px;border:none;background:var(--snap-polaroid);color:#111;cursor:pointer;font-weight:600;">capture anyway</button>
      <button id="lazy-cancel" style="padding:4px 10px;border-radius:6px;border:1px solid var(--snap-border);background:var(--snap-surface);color:var(--snap-muted);cursor:pointer;">cancel</button>
      <br><label style="margin-top:8px;display:block;"><input type="checkbox" id="lazy-dontask"> don't ask again</label>
    </div>
  `;
  statusEl.className = 'status error';
  statusEl.classList.remove('hidden');

  document.getElementById('lazy-proceed').addEventListener('click', async () => {
    const dontAsk = document.getElementById('lazy-dontask').checked;
    if (dontAsk) {
      settings.suppressLazyWarning = true;
      await chrome.storage.local.set({ settings });
    }
    statusEl.classList.add('hidden');
    const btn = document.getElementById('btn-snap');
    btn.disabled = true;
    btn.textContent = 'exposing...';

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractContent',
      options: { deepCapture: false, maxImages: settings.maxImages || 20 }
    });

    if (!response.error) {
      const result = await chrome.runtime.sendMessage({ action: 'saveClip', data: response });
      if (result.success) {
        showStatus('snapped. added to the roll.', 'success');
        await updateClipCount();
        await updateUsageInfo();
      } else if (result.limitReached) {
        showStatus(result.error, 'error');
      }
    }
    btn.disabled = false;
    btn.textContent = 'snap this page';
  });

  document.getElementById('lazy-cancel').addEventListener('click', () => {
    statusEl.classList.add('hidden');
  });
}

async function snapSelection() {
  const btn = document.getElementById('btn-snap-selection');
  btn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    });

    if (!result || result.trim().length === 0) {
      showStatus('no text selected on the page.', 'error');
      btn.disabled = false;
      return;
    }

    const data = {
      title: `Selection from: ${tab.title}`,
      url: tab.url,
      text: result.trim(),
      images: [],
      isQuote: true
    };

    const saveResult = await chrome.runtime.sendMessage({ action: 'saveClip', data });

    if (saveResult.success) {
      showStatus('selection captured.', 'success');
      await updateClipCount();
    } else {
      showStatus(saveResult.error || 'failed to save', 'error');
    }
  } catch (err) {
    showStatus('could not capture selection.', 'error');
    console.error(err);
  }

  btn.disabled = false;
}

async function showLibrary() {
  switchView('view-library');
  const response = await chrome.runtime.sendMessage({ action: 'getClips' });
  currentClips = response.clips || [];
  renderClips();
}

function showCapture() {
  switchView('view-capture');
}

function showDetail(clipId) {
  const clip = currentClips.find(c => c.id === clipId);
  if (!clip) return;

  switchView('view-detail');
  const detail = document.getElementById('clip-detail');

  detail.innerHTML = `
    <h3>${escapeHtml(clip.title)}</h3>
    <div class="meta">
      ${new Date(clip.createdAt).toLocaleString()} \u00b7 ${clip.images.length} images
    </div>
    ${clip.summary ? `<div class="text-preview"><strong>summary:</strong><br>${escapeHtml(clip.summary)}</div>` : ''}
    <div class="text-preview">${escapeHtml(clip.text.slice(0, 500))}${clip.text.length > 500 ? '...' : ''}</div>
    <div class="actions">
      <button class="btn-ai" data-action="summarize" data-id="${clip.id}">summarize</button>
      <button data-action="copy-md" data-id="${clip.id}">copy markdown</button>
      <button data-action="export" data-id="${clip.id}">download</button>
      <button data-action="delete" data-id="${clip.id}">delete</button>
    </div>
  `;

  detail.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleDetailAction);
  });
}

async function handleDetailAction(e) {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;

  if (action === 'summarize') {
    e.target.disabled = true;
    e.target.textContent = 'thinking...';
    const result = await chrome.runtime.sendMessage({ action: 'summarizeClip', id });
    if (result.success) {
      showDetail(id);
      showStatus('summary generated.', 'success');
    } else {
      showStatus(result.error, 'error');
      e.target.textContent = 'summarize';
      e.target.disabled = false;
    }
  }

  if (action === 'copy-md') {
    const result = await chrome.runtime.sendMessage({ action: 'exportClip', id, format: 'markdown' });
    if (result.success) {
      await navigator.clipboard.writeText(result.content);
      showStatus('copied.', 'success');
    }
  }

  if (action === 'export') {
    e.target.textContent = 'developing...';
    const result = await chrome.runtime.sendMessage({ action: 'exportClip', id, format: 'markdown-with-images' });
    if (result.success) {
      e.target.textContent = 'done.';
      setTimeout(() => { e.target.textContent = 'download'; }, 2000);
    }
  }

  if (action === 'delete') {
    if (confirm('delete this clip?')) {
      await chrome.runtime.sendMessage({ action: 'deleteClip', id });
      await updateClipCount();
      showLibrary();
    }
  }
}

function renderClips() {
  const list = document.getElementById('clips-list');
  const empty = document.getElementById('empty-state');

  if (currentClips.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = currentClips.map(clip => `
    <div class="clip-item" data-id="${clip.id}">
      <div class="clip-item-title">${escapeHtml(clip.title)}</div>
      <div class="clip-item-meta">
        ${new Date(clip.createdAt).toLocaleDateString()} \u00b7 ${clip.text.length} chars \u00b7 ${clip.images.length} imgs
        ${clip.summary ? ' \u00b7 summarized' : ''}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.clip-item').forEach(item => {
    item.addEventListener('click', () => showDetail(item.dataset.id));
  });
}

async function updateClipCount() {
  const response = await chrome.runtime.sendMessage({ action: 'getClips' });
  const count = (response.clips || []).length;
  document.getElementById('clip-count').textContent = count;
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
}

function showStatus(message, type) {
  const el = document.getElementById('snap-status');
  el.textContent = message;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function updateAutoCaptureIndicator() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAutoCaptureStatus' });
    if (response.active) {
      const el = document.getElementById('usage-info');
      const current = el.textContent;
      el.textContent = current + ' · auto-shutter on';
    }
  } catch (e) {
    // Not critical
  }
}
