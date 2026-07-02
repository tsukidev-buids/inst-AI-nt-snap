document.addEventListener('DOMContentLoaded', init);

let currentClips = [];

async function init() {
  await updateClipCount();
  await updateUsageInfo();
  bindEvents();
}

async function updateUsageInfo() {
  const license = await chrome.runtime.sendMessage({ action: 'getLicenseStatus' });
  const el = document.getElementById('usage-info');

  if (license.isPro) {
    el.textContent = '⚡ Pro — Unlimited';
    el.style.color = '#4ade80';
  } else {
    const usage = await chrome.runtime.sendMessage({ action: 'getUsage' });
    const remaining = 5 - (usage.clips || 0);
    el.textContent = `Free: ${remaining} clips remaining today`;
    if (remaining <= 1) el.style.color = '#f87171';
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
  btn.textContent = '⏳ Checking page...';

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
      btn.textContent = '📸 Snap This Page';
      btn.disabled = false;
      showLazyWarning(tab, settings);
      return;
    }

    btn.textContent = settings.deepCapture ? '⏳ Deep capturing...' : '⏳ Capturing...';

    // For deep capture, we need to keep the popup alive or it will close
    // Send message and wait for response
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractContent',
      options: { deepCapture: settings.deepCapture || false }
    });

    if (response.error) {
      showStatus('❌ ' + response.message, 'error');
      btn.disabled = false;
      btn.textContent = '📸 Snap This Page';
      return;
    }

    // Show any warnings
    if (response.warnings && response.warnings.length > 0) {
      showStatus('⚠️ ' + response.warnings[0], 'error');
    }

    const result = await chrome.runtime.sendMessage({ action: 'saveClip', data: response });

    if (result.success) {
      showStatus('✅ Snapped! Saved to library.', 'success');
      await updateClipCount();
      await updateUsageInfo();
    } else if (result.limitReached) {
      showStatus('🔒 ' + result.error, 'error');
    } else {
      showStatus('❌ ' + (result.error || 'Failed to save'), 'error');
    }
  } catch (err) {
    showStatus('❌ Could not capture page. Try refreshing.', 'error');
    console.error(err);
  }

  btn.disabled = false;
  btn.textContent = '📸 Snap This Page';
}

function showLazyWarning(tab, settings) {
  const statusEl = document.getElementById('snap-status');
  statusEl.innerHTML = `
    <div style="text-align:left;font-size:12px;">
      ⚠️ This page lazy-loads content. Capture may be partial.<br><br>
      <button id="lazy-proceed" style="margin-right:6px;padding:4px 10px;border-radius:6px;border:none;background:#667eea;color:#fff;cursor:pointer;">Capture Anyway</button>
      <button id="lazy-cancel" style="padding:4px 10px;border-radius:6px;border:1px solid #444;background:#2a2a3e;color:#ccc;cursor:pointer;">Cancel</button>
      <br><label style="margin-top:8px;display:block;"><input type="checkbox" id="lazy-dontask"> Don't ask again</label>
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
    // Proceed with capture
    const btn = document.getElementById('btn-snap');
    btn.disabled = true;
    btn.textContent = '⏳ Capturing...';

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractContent',
      options: { deepCapture: false }
    });

    if (!response.error) {
      const result = await chrome.runtime.sendMessage({ action: 'saveClip', data: response });
      if (result.success) {
        showStatus('✅ Snapped! Saved to library.', 'success');
        await updateClipCount();
        await updateUsageInfo();
      } else if (result.limitReached) {
        showStatus('🔒 ' + result.error, 'error');
      }
    }
    btn.disabled = false;
    btn.textContent = '📸 Snap This Page';
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
      showStatus('⚠️ No text selected on the page.', 'error');
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
      showStatus('✅ Selection saved!', 'success');
      await updateClipCount();
    } else {
      showStatus('❌ ' + (saveResult.error || 'Failed to save'), 'error');
    }
  } catch (err) {
    showStatus('❌ Could not capture selection.', 'error');
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
      ${new Date(clip.createdAt).toLocaleString()} · ${clip.images.length} images
    </div>
    ${clip.summary ? `<div class="text-preview"><strong>Summary:</strong><br>${escapeHtml(clip.summary)}</div>` : ''}
    <div class="text-preview">${escapeHtml(clip.text.slice(0, 500))}${clip.text.length > 500 ? '...' : ''}</div>
    <div class="actions">
      <button class="btn-ai" data-action="summarize" data-id="${clip.id}">🤖 Summarize</button>
      <button data-action="copy-md" data-id="${clip.id}">📋 Copy as Markdown</button>
      <button data-action="export" data-id="${clip.id}">💾 Download</button>
      <button data-action="delete" data-id="${clip.id}">🗑️ Delete</button>
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
    e.target.textContent = '⏳ Summarizing...';
    const result = await chrome.runtime.sendMessage({ action: 'summarizeClip', id });
    if (result.success) {
      showDetail(id); // refresh view
      showStatus('✅ Summary generated!', 'success');
    } else {
      showStatus('❌ ' + result.error, 'error');
      e.target.textContent = '🤖 Summarize';
    }
  }

  if (action === 'copy-md') {
    const result = await chrome.runtime.sendMessage({ action: 'exportClip', id, format: 'markdown' });
    if (result.success) {
      await navigator.clipboard.writeText(result.content);
      showStatus('📋 Copied to clipboard!', 'success');
    }
  }

  if (action === 'export') {
    e.target.textContent = '⏳ Downloading...';
    const result = await chrome.runtime.sendMessage({ action: 'exportClip', id, format: 'markdown-with-images' });
    if (result.success) {
      e.target.textContent = '✅ Done!';
      setTimeout(() => { e.target.textContent = '💾 Download'; }, 2000);
    }
  }

  if (action === 'delete') {
    if (confirm('Delete this clip?')) {
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
        ${new Date(clip.createdAt).toLocaleDateString()} · ${clip.text.length} chars · ${clip.images.length} imgs
        ${clip.summary ? ' · 🤖 summarized' : ''}
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
