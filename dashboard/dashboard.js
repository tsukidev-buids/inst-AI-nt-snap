document.addEventListener('DOMContentLoaded', init);

let allClips = [];
let selectedPromptClips = new Set();

async function init() {
  await loadLibrary();
  bindNavigation();
  bindSearch();
  bindPromptBuilder();
  bindSession();
  bindAutoCapture();
  bindResearch();
  bindModal();
  applyProGating();
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Listen for storage changes to auto-refresh
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.clips) {
        allClips = changes.clips.newValue || [];
        renderLibrary();
        // Refresh research if it's visible
        if (!document.getElementById('view-research').classList.contains('hidden')) {
          loadResearchSources();
          loadQuotes();
        }
      }
      if (changes.researchFolders) {
        researchFolders = changes.researchFolders.newValue || [];
        renderFolders();
        updateBulkProjectDropdown();
      }
      if (changes.license) {
        applyProGating();
      }
    }
  });
}

async function applyProGating() {
  const license = await chrome.runtime.sendMessage({ action: 'getLicenseStatus' });

  const proNavBtns = document.querySelectorAll('.nav-btn[data-view="auto-capture"], .nav-btn[data-view="session"]');

  if (!license.isPro) {
    // Add pro badges to nav buttons
    proNavBtns.forEach(btn => {
      if (!btn.querySelector('.pro-badge-sm')) {
        btn.innerHTML += ' <span class="pro-badge-sm">PRO</span>';
      }
    });

    // Grey out pro-only sections
    document.getElementById('btn-capture-all').disabled = true;
    document.getElementById('btn-capture-all').classList.add('btn-disabled');

    document.getElementById('btn-start-ac').disabled = true;
    document.getElementById('btn-start-ac').classList.add('btn-disabled');

    // Add overlay messages
    const sessionView = document.getElementById('view-session');
    if (!sessionView.querySelector('.pro-overlay')) {
      sessionView.insertAdjacentHTML('afterbegin', `
        <div class="pro-overlay">🔒 Session Capture is a Pro feature. <a href="#" class="pro-upgrade-link">Upgrade</a></div>
      `);
    }

    const acView = document.getElementById('view-auto-capture');
    if (!acView.querySelector('.pro-overlay')) {
      acView.insertAdjacentHTML('afterbegin', `
        <div class="pro-overlay">🔒 Auto Capture is a Pro feature. <a href="#" class="pro-upgrade-link">Upgrade</a></div>
      `);
    }

    // Grey out pro-only export modes
    document.querySelectorAll('.research-mode-btn').forEach(btn => {
      if (btn.dataset.mode !== 'bibliography') {
        btn.classList.add('btn-disabled');
        if (!btn.querySelector('.pro-badge-sm')) {
          btn.innerHTML += ' <span class="pro-badge-sm">PRO</span>';
        }
      }
    });

    // Show usage info on export tab
    const exportPanel = document.getElementById('research-export');
    if (exportPanel && !exportPanel.querySelector('.free-usage-info')) {
      const usage = await chrome.runtime.sendMessage({ action: 'getUsage' });
      const bibRemaining = 1 - (usage.prompts || 0);
      exportPanel.insertAdjacentHTML('afterbegin', `
        <div class="free-usage-info" style="background:#1a1a3e;border:1px solid #2a2a3e;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#888;">
          📎 Bibliography Only: <strong style="color:${bibRemaining > 0 ? '#4ade80' : '#f87171'}">${Math.max(0, bibRemaining)} use remaining today</strong><br>
          Other export modes require Pro.
        </div>
      `);
    }

    // Wire up upgrade links
    document.querySelectorAll('.pro-upgrade-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
    });
  } else {
    // Remove all pro gates
    document.querySelectorAll('.pro-badge-sm').forEach(el => el.remove());
    document.querySelectorAll('.pro-overlay').forEach(el => el.remove());
    document.querySelectorAll('.free-usage-info').forEach(el => el.remove());
    document.querySelectorAll('.research-mode-btn').forEach(btn => btn.classList.remove('btn-disabled'));
    document.getElementById('btn-capture-all').disabled = false;
    document.getElementById('btn-capture-all').classList.remove('btn-disabled');
    document.getElementById('btn-start-ac').disabled = false;
    document.getElementById('btn-start-ac').classList.remove('btn-disabled');
  }
}

// --- Navigation ---

let selectMode = false;
let selectedClipIds = new Set();

function bindNavigation() {
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      document.getElementById(`view-${view}`).classList.remove('hidden');

      // Load data for specific views
      if (view === 'session') loadOpenTabs();
      if (view === 'prompt-builder') loadPromptClips();
      if (view === 'auto-capture') loadAutoCaptureStatus();
      if (view === 'research') loadResearch();
    });
  });

  // Select mode
  document.getElementById('btn-select-mode').addEventListener('click', enterSelectMode);
  document.getElementById('btn-cancel-select').addEventListener('click', exitSelectMode);
  document.getElementById('btn-bulk-send').addEventListener('click', bulkSendToProject);
  document.getElementById('btn-bulk-delete').addEventListener('click', bulkDelete);
}

// --- Library ---

async function loadLibrary() {
  const response = await chrome.runtime.sendMessage({ action: 'getClips' });
  allClips = response.clips || [];

  // Also load folders for bulk actions
  const foldersResponse = await chrome.runtime.sendMessage({ action: 'getFolders' });
  researchFolders = foldersResponse.folders || [];

  renderLibrary();
}

function renderLibrary() {
  const grid = document.getElementById('library-list');
  const empty = document.getElementById('library-empty');
  document.getElementById('total-clips').textContent = `${allClips.length} clips`;

  // Calculate storage used
  const bytes = new Blob([JSON.stringify(allClips)]).size;
  document.getElementById('storage-used').textContent = formatBytes(bytes);

  if (allClips.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = allClips.map(clip => `
    <div class="clip-card ${selectMode ? 'selectable' : ''} ${selectedClipIds.has(clip.id) ? 'selected' : ''}" data-id="${clip.id}">
      <div class="select-check">${selectedClipIds.has(clip.id) ? '✓' : ''}</div>
      <div class="clip-card-title">${escapeHtml(clip.title)}</div>
      <div class="clip-card-meta">
        ${new Date(clip.createdAt).toLocaleDateString()} · ${clip.images.length} imgs
        ${clip.summary ? ' · 🤖' : ''}
        ${clip.folder ? ' · 📁' : ''}
      </div>
      <div class="clip-card-preview">${escapeHtml(clip.text.slice(0, 120))}</div>
      ${clip.pageType ? `<span class="clip-card-type">${clip.pageType}</span>` : ''}
    </div>
  `).join('');

  grid.querySelectorAll('.clip-card').forEach(card => {
    card.addEventListener('click', () => {
      if (selectMode) {
        toggleSelectClip(card.dataset.id, card);
      } else {
        openClipModal(card.dataset.id);
      }
    });
  });
}

function enterSelectMode() {
  selectMode = true;
  selectedClipIds.clear();
  document.getElementById('btn-select-mode').classList.add('hidden');
  document.getElementById('bulk-actions').classList.remove('hidden');
  updateBulkProjectDropdown();
  renderLibrary();
}

function exitSelectMode() {
  selectMode = false;
  selectedClipIds.clear();
  document.getElementById('btn-select-mode').classList.remove('hidden');
  document.getElementById('bulk-actions').classList.add('hidden');
  renderLibrary();
}

function toggleSelectClip(clipId, cardEl) {
  if (selectedClipIds.has(clipId)) {
    selectedClipIds.delete(clipId);
    cardEl.classList.remove('selected');
    cardEl.querySelector('.select-check').textContent = '';
  } else {
    selectedClipIds.add(clipId);
    cardEl.classList.add('selected');
    cardEl.querySelector('.select-check').textContent = '✓';
  }
  document.getElementById('selected-count').textContent = `${selectedClipIds.size} selected`;
}

function updateBulkProjectDropdown() {
  const select = document.getElementById('bulk-project-select');
  const options = researchFolders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  select.innerHTML = `<option value="">Send to project...</option>${options}`;
}

async function bulkSendToProject() {
  const folderId = document.getElementById('bulk-project-select').value;
  if (!folderId) return;
  if (selectedClipIds.size === 0) return;

  for (const clipId of selectedClipIds) {
    await chrome.runtime.sendMessage({ action: 'assignFolder', clipId, folderId });
  }

  // Update local data
  allClips.forEach(clip => {
    if (selectedClipIds.has(clip.id)) clip.folder = folderId;
  });

  exitSelectMode();
  await loadLibrary();
}

async function bulkDelete() {
  if (selectedClipIds.size === 0) return;
  if (!confirm(`Delete ${selectedClipIds.size} clips? This cannot be undone.`)) return;

  for (const clipId of selectedClipIds) {
    await chrome.runtime.sendMessage({ action: 'deleteClip', id: clipId });
  }

  exitSelectMode();
  await loadLibrary();
}

// --- Search ---

function bindSearch() {
  const input = document.getElementById('search-input');
  const btn = document.getElementById('btn-search');

  btn.addEventListener('click', () => performSearch(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch(input.value);
  });
}

async function performSearch(query) {
  if (!query.trim()) return;

  const response = await chrome.runtime.sendMessage({ action: 'searchClips', query: query.trim() });
  const results = response.results || [];
  const grid = document.getElementById('search-results');
  const empty = document.getElementById('search-empty');

  if (results.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = results.map(r => `
    <div class="clip-card" data-id="${r.id}">
      <div class="clip-card-title">${escapeHtml(r.title)}</div>
      <div class="clip-card-meta">${new Date(r.createdAt).toLocaleDateString()}</div>
      <div class="clip-card-preview">${escapeHtml(r.snippet)}</div>
      ${r.pageType ? `<span class="clip-card-type">${r.pageType}</span>` : ''}
    </div>
  `).join('');

  grid.querySelectorAll('.clip-card').forEach(card => {
    card.addEventListener('click', () => openClipModal(card.dataset.id));
  });
}

// --- Prompt Builder ---

function bindPromptBuilder() {
  document.getElementById('btn-build-prompt').addEventListener('click', buildAndDownloadPrompt);

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Deselect others
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('prompt-instruction').value = btn.dataset.instruction;
    });
  });

  // If user types custom instruction, deselect presets
  document.getElementById('prompt-instruction').addEventListener('input', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  });
}

function loadPromptClips() {
  const list = document.getElementById('prompt-clips-list');
  selectedPromptClips.clear();

  list.innerHTML = allClips.map(clip => `
    <label class="clip-select-item" data-id="${clip.id}">
      <input type="checkbox" value="${clip.id}">
      <span class="title">${escapeHtml(clip.title)}</span>
    </label>
  `).join('');

  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const item = e.target.closest('.clip-select-item');
      if (e.target.checked) {
        selectedPromptClips.add(e.target.value);
        item.classList.add('selected');
      } else {
        selectedPromptClips.delete(e.target.value);
        item.classList.remove('selected');
      }
    });
  });
}

async function buildAndDownloadPrompt() {
  if (selectedPromptClips.size === 0) {
    showPromptStatus('Select at least one clip.', 'error');
    return;
  }

  const instruction = document.getElementById('prompt-instruction').value.trim();
  if (!instruction) {
    showPromptStatus('Add an instruction (e.g., compare, summarize).', 'error');
    return;
  }

  // Check limit
  const check = await chrome.runtime.sendMessage({ action: 'checkCanPrompt' });
  if (!check.allowed) {
    showPromptStatus('🔒 ' + check.reason, 'error');
    return;
  }

  const btn = document.getElementById('btn-build-prompt');
  btn.disabled = true;
  btn.textContent = '⏳ Building...';

  const response = await chrome.runtime.sendMessage({
    action: 'buildPrompt',
    clipIds: [...selectedPromptClips],
    instruction
  });

  if (response.success) {
    // Determine folder type from instruction
    const presets = ['compare', 'summarize', 'summarise', 'key points', 'combine', 'timeline', 'differences', 'pros and cons', 'explain'];
    const instructionLower = instruction.toLowerCase().trim();
    let folderType = presets.find(p => instructionLower === p || instructionLower.startsWith(p));
    if (!folderType) {
      folderType = instruction.slice(0, 30).replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, '-').toLowerCase();
    }
    folderType = folderType.replace(/\s+/g, '-');

    // Build a readable folder name from clip titles
    const clips = allClips.filter(c => [...selectedPromptClips].includes(c.id));
    const promptName = buildPromptFolderName(clips);

    const folderPath = `InstantSnap/${folderType}/${promptName}`;

    // Download the markdown prompt
    const dataUrl = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(response.prompt)));
    await chrome.downloads.download({
      url: dataUrl,
      filename: `${folderPath}/prompt.md`,
      saveAs: false
    });

    // Download images if enabled in settings
    const { settings = {} } = await chrome.storage.local.get('settings');
    if (settings.downloadImages !== false) {
      for (const clip of clips) {
        if (clip.images && clip.images.length > 0) {
          const clipFolder = clip.title.replace(/[^a-z0-9\s\-]/gi, '').replace(/\s+/g, '-').slice(0, 40).toLowerCase();
          for (let i = 0; i < clip.images.length; i++) {
            const imgUrl = clip.images[i];
            const ext = getImageExtension(imgUrl);
            try {
              await chrome.downloads.download({
                url: imgUrl,
                filename: `${folderPath}/images/${clipFolder}/image-${i + 1}${ext}`,
                saveAs: false
              });
            } catch (err) {
              // Skip failed downloads
            }
          }
        }
      }
    }

    // Copy paste message to clipboard, show it visibly too
    const pasteMsg = 'Follow the instructions in the attached file.';
    try {
      await navigator.clipboard.writeText(pasteMsg);
      showPromptStatus(`✅ Downloaded! Paste this into your AI: "${pasteMsg}"`, 'success');
    } catch (e) {
      showPromptStatus(`✅ Downloaded! Type this into your AI: "${pasteMsg}"`, 'success');
    }
  } else {
    showPromptStatus('❌ ' + (response.error || 'Failed to build prompt.'), 'error');
  }

  btn.disabled = false;
  btn.textContent = '💾 Build & Download Prompt';
}

function getImageExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|avif)(\?|$)/i);
    if (match) return '.' + match[1].toLowerCase();
  } catch (e) {}
  return '.png';
}

function buildPromptFolderName(clips) {
  // Strip common suffixes and extract the meaningful part of each title
  const noise = ['wikipedia', 'wiki', 'article', 'selection from', 'the free encyclopedia'];

  const names = clips.map(clip => {
    let title = clip.title.toLowerCase();
    // Remove "Selection from: " prefix
    title = title.replace(/^selection from:\s*/i, '');
    // Remove " - Wikipedia" and similar suffixes
    title = title.replace(/\s*[-–—|]\s*(wikipedia|wiki|medium|substack).*$/i, '');
    // Remove noise words
    noise.forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
    // Clean up and take first 2-3 meaningful words
    const words = title.trim().split(/\s+/).filter(w => w.length > 1).slice(0, 3);
    return words.join('-');
  }).filter(n => n.length > 0);

  if (names.length === 0) return 'prompt-' + Date.now().toString(36);

  // Join with " + " style separator, cap total length
  const joined = names.join('_and_');
  return joined.replace(/[^a-z0-9\-_]/gi, '').slice(0, 80) || 'prompt';
}

function showPromptStatus(msg, type) {
  const el = document.getElementById('prompt-status');
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// --- Session Capture ---

function bindSession() {
  document.getElementById('btn-capture-all').addEventListener('click', captureSession);
}

async function loadOpenTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const list = document.getElementById('open-tabs-list');

  const httpTabs = tabs.filter(t => t.url && t.url.startsWith('http'));
  list.innerHTML = httpTabs.map(tab => `
    <div class="tab-item">
      <img src="${tab.favIconUrl || ''}" alt="">
      <div>
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tab-url">${escapeHtml(tab.url.slice(0, 60))}</div>
      </div>
    </div>
  `).join('');
}

async function captureSession() {
  // Block if not Pro
  const license = await chrome.runtime.sendMessage({ action: 'getLicenseStatus' });
  if (!license.isPro) {
    const check = await chrome.runtime.sendMessage({ action: 'checkCanSession' });
    if (!check.allowed) {
      const status = document.getElementById('session-status');
      status.textContent = '🔒 ' + check.reason;
      status.className = 'status error';
      status.classList.remove('hidden');
      return;
    }
  }

  const btn = document.getElementById('btn-capture-all');
  btn.disabled = true;
  btn.textContent = '⏳ Capturing...';

  const response = await chrome.runtime.sendMessage({ action: 'captureSession' });
  const status = document.getElementById('session-status');

  if (response.success) {
    status.textContent = `✅ Captured ${response.captured} of ${response.total} tabs. ${response.failed ? `(${response.failed} failed)` : ''}`;
    status.className = 'status success';
    await loadLibrary(); // refresh
  } else {
    status.textContent = '❌ Failed to capture session.';
    status.className = 'status error';
  }

  status.classList.remove('hidden');
  btn.disabled = false;
  btn.textContent = '📑 Capture All Open Tabs';
}

// --- Auto Capture ---

function bindAutoCapture() {
  document.getElementById('btn-start-ac').addEventListener('click', startAutoCapture);
  document.getElementById('btn-stop-ac').addEventListener('click', stopAutoCapture);
}

async function loadAutoCaptureStatus() {
  const response = await chrome.runtime.sendMessage({ action: 'getAutoCaptureStatus' });
  if (response.active) {
    document.getElementById('btn-start-ac').classList.add('hidden');
    document.getElementById('btn-stop-ac').classList.remove('hidden');
    showACStatus('Auto capture is running.', 'success');
  }

  // Restore rule values into the inputs
  if (response.rules && response.rules.length > 0) {
    const domainRule = response.rules.find(r => r.type === 'domain');
    const timeRule = response.rules.find(r => r.type === 'time');
    if (domainRule) document.getElementById('ac-domain').value = domainRule.value || '';
    if (timeRule) document.getElementById('ac-time').value = timeRule.value || 120;
  }
}

async function startAutoCapture() {
  // Block if not Pro
  const license = await chrome.runtime.sendMessage({ action: 'getLicenseStatus' });
  if (!license.isPro) {
    showACStatus('🔒 Auto Capture is a Pro feature. Upgrade in Settings.', 'error');
    return;
  }

  const domain = document.getElementById('ac-domain').value.trim();
  const time = parseInt(document.getElementById('ac-time').value) || 120;

  const rules = [];
  if (domain) rules.push({ type: 'domain', value: domain });
  rules.push({ type: 'time', value: time });

  if (rules.length === 0) {
    showACStatus('Add at least one rule.', 'error');
    return;
  }

  await chrome.runtime.sendMessage({ action: 'startAutoCapture', rules });
  document.getElementById('btn-start-ac').classList.add('hidden');
  document.getElementById('btn-stop-ac').classList.remove('hidden');
  showACStatus(`Auto capture started. ${domain ? `Domain: ${domain}. ` : ''}Time threshold: ${time}s.`, 'success');
}

async function stopAutoCapture() {
  await chrome.runtime.sendMessage({ action: 'stopAutoCapture' });
  document.getElementById('btn-stop-ac').classList.add('hidden');
  document.getElementById('btn-start-ac').classList.remove('hidden');
  showACStatus('Auto capture stopped.', 'success');
}

function showACStatus(msg, type) {
  const el = document.getElementById('ac-status');
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
}

// --- Modal ---

function bindModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('clip-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('clip-modal')) closeModal();
  });
}

function openClipModal(clipId) {
  const clip = allClips.find(c => c.id === clipId);
  if (!clip) return;

  const modal = document.getElementById('clip-modal');
  const body = document.getElementById('modal-body');

  // Build folder assignment dropdown
  const folderOptions = researchFolders.map(f =>
    `<option value="${f.id}" ${clip.folder === f.id ? 'selected' : ''}>${escapeHtml(f.name)}</option>`
  ).join('');

  body.innerHTML = `
    <h2>${escapeHtml(clip.title)}</h2>
    <div class="meta">
      <a href="${clip.url}" target="_blank">${clip.url}</a><br>
      ${new Date(clip.createdAt).toLocaleString()} · ${clip.images.length} images · ${clip.wordCount || 0} words
      ${clip.pageType ? ` · ${clip.pageType}` : ''}
    </div>
    ${clip.citations ? `<div class="text-content" style="font-size:12px;padding:10px;margin-bottom:8px;background:#0f0f1a;border-radius:8px;"><strong>Citation:</strong> ${escapeHtml(clip.citations.apa)}</div>` : ''}
    ${clip.summary ? `<div class="text-content"><strong>AI Summary:</strong>\n${escapeHtml(clip.summary)}</div>` : ''}
    <div class="text-content">${escapeHtml(clip.text.slice(0, 2000))}${clip.text.length > 2000 ? '\n\n[...truncated]' : ''}</div>
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
      <label style="font-size:12px;color:#aaa;">Project:</label>
      <select id="modal-folder-select" style="padding:6px 10px;border-radius:6px;border:1px solid #333;background:#2a2a3e;color:#eee;font-size:12px;">
        <option value="">None</option>
        ${folderOptions}
      </select>
      <label style="font-size:12px;color:#aaa;margin-left:12px;">
        <input type="checkbox" id="modal-quote-toggle" ${clip.isQuote ? 'checked' : ''}> Quote
      </label>
    </div>
    <div class="actions">
      <button class="btn-ai" data-action="summarize" data-id="${clip.id}">🤖 Summarize</button>
      <button data-action="copy-md" data-id="${clip.id}">📋 Copy Markdown</button>
      <button data-action="export" data-id="${clip.id}">💾 Download</button>
      <button data-action="delete" data-id="${clip.id}">🗑️ Delete</button>
    </div>
  `;

  // Bind folder assignment
  document.getElementById('modal-folder-select').addEventListener('change', async (e) => {
    const folderId = e.target.value || null;
    await chrome.runtime.sendMessage({ action: 'assignFolder', clipId: clip.id, folderId });
    clip.folder = folderId;
    // Refresh views
    renderLibrary();
    if (!document.getElementById('view-research').classList.contains('hidden')) {
      loadResearchSources();
    }
  });

  // Bind quote toggle
  document.getElementById('modal-quote-toggle').addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ action: 'toggleQuote', clipId: clip.id });
    clip.isQuote = !clip.isQuote;
    // Refresh views
    if (!document.getElementById('view-research').classList.contains('hidden')) {
      loadResearchSources();
      loadQuotes();
    }
  });

  body.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleModalAction);
  });

  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('clip-modal').classList.add('hidden');
}

async function handleModalAction(e) {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;

  if (action === 'summarize') {
    e.target.textContent = '⏳...';
    const result = await chrome.runtime.sendMessage({ action: 'summarizeClip', id });
    if (result.success) {
      await loadLibrary();
      openClipModal(id);
    } else {
      e.target.textContent = '❌ ' + result.error;
    }
  }

  if (action === 'copy-md') {
    const result = await chrome.runtime.sendMessage({ action: 'exportClip', id, format: 'markdown' });
    if (result.success) {
      await navigator.clipboard.writeText(result.content);
      e.target.textContent = '✅ Copied!';
      setTimeout(() => { e.target.textContent = '📋 Copy Markdown'; }, 2000);
    }
  }

  if (action === 'export') {
    e.target.textContent = '⏳ Downloading...';
    const result = await chrome.runtime.sendMessage({ action: 'exportClip', id, format: 'markdown-with-images' });
    if (result.success) {
      e.target.textContent = '✅ Downloaded!';
      setTimeout(() => { e.target.textContent = '💾 Download'; }, 2000);
    }
  }

  if (action === 'delete') {
    if (confirm('Delete this clip?')) {
      await chrome.runtime.sendMessage({ action: 'deleteClip', id });
      closeModal();
      await loadLibrary();
      if (!document.getElementById('view-research').classList.contains('hidden')) {
        loadResearchSources();
        loadQuotes();
      }
    }
  }
}

// --- Research ---

let currentFolderId = null;
let researchFolders = [];
let selectedResearchMode = 'outline';

function bindResearch() {
  document.getElementById('btn-create-folder').addEventListener('click', createNewFolder);
  document.getElementById('new-folder-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createNewFolder();
  });

  // Research tabs
  document.querySelectorAll('.research-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.research-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.research-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(`research-${tab.dataset.tab}`).classList.remove('hidden');

      if (tab.dataset.tab === 'quotes') loadQuotes();
    });
  });

  // Research mode buttons
  document.querySelectorAll('.research-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.research-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedResearchMode = btn.dataset.mode;
    });
  });

  // Bibliography download only
  document.getElementById('btn-research-export').addEventListener('click', exportResearch);

  // Global citation style picker in research tab bar
  document.getElementById('research-citation-style').addEventListener('change', () => {
    // Reload views with new style
    loadResearchSources();
    loadQuotes();
  });

  // Pro upgrade links
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('pro-upgrade-link')) {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    }
  });
}

async function loadResearch() {
  const response = await chrome.runtime.sendMessage({ action: 'getFolders' });
  researchFolders = response.folders || [];
  renderFolders();

  if (researchFolders.length > 0 && !currentFolderId) {
    currentFolderId = researchFolders[0].id;
  }
  loadResearchSources();
}

function renderFolders() {
  const list = document.getElementById('research-folders');

  if (researchFolders.length === 0) {
    list.innerHTML = '<p style="font-size:12px;color:#666;">No projects yet.</p>';
    return;
  }

  list.innerHTML = researchFolders.map(f => {
    const count = allClips.filter(c => c.folder === f.id).length;
    return `
      <div class="folder-item ${f.id === currentFolderId ? 'active' : ''}" data-id="${f.id}">
        <span class="folder-name">${escapeHtml(f.name)}</span>
        <span class="folder-right">
          <span class="folder-count">${count}</span>
          <button class="folder-delete" data-id="${f.id}" title="Delete project">×</button>
        </span>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('folder-delete')) return;
      currentFolderId = item.dataset.id;
      renderFolders();
      loadResearchSources();
    });
  });

  list.querySelectorAll('.folder-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.id;
      const folder = researchFolders.find(f => f.id === folderId);
      if (!confirm(`Delete project "${folder.name}"? Clips won't be deleted, just unassigned.`)) return;
      await chrome.runtime.sendMessage({ action: 'deleteFolder', folderId });
      if (currentFolderId === folderId) currentFolderId = null;
      await loadResearch();
    });
  });
}

async function createNewFolder() {
  const input = document.getElementById('new-folder-name');
  const name = input.value.trim();
  if (!name) return;

  const result = await chrome.runtime.sendMessage({ action: 'createFolder', name });
  if (result.success) {
    input.value = '';
    currentFolderId = result.folder.id;
    await loadResearch();
  } else if (result.limitReached) {
    alert('🔒 ' + result.error);
  }
}

function loadResearchSources() {
  const list = document.getElementById('research-sources-list');
  const empty = document.getElementById('research-sources-empty');

  if (!currentFolderId) {
    list.innerHTML = '';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = 'Create a project to get started, then assign clips from the Library.';
    return;
  }

  const sources = allClips.filter(c => c.folder === currentFolderId);
  const style = document.getElementById('research-citation-style').value;

  if (sources.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = sources.map(clip => {
    const citation = clip.citations ? clip.citations[style] : '';
    return `
      <div class="clip-card" data-id="${clip.id}">
        <div class="clip-card-title">${clip.isQuote ? '💬 ' : ''}${escapeHtml(clip.title)}</div>
        <div class="clip-card-meta">
          ${clip.wordCount || 0} words · ${citation ? '📎 cited' : ''}
          ${clip.notes ? ' · 📝' : ''}
        </div>
        <div class="clip-card-preview">${citation ? escapeHtml(citation.slice(0, 120)) : escapeHtml(clip.text.slice(0, 80))}</div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.clip-card').forEach(card => {
    card.addEventListener('click', () => openClipModal(card.dataset.id));
  });
}

function loadQuotes() {
  const list = document.getElementById('research-quotes-list');
  const empty = document.getElementById('research-quotes-empty');

  if (!currentFolderId) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  const quotes = allClips.filter(c => c.folder === currentFolderId && c.isQuote);
  const style = document.getElementById('research-citation-style').value;

  if (quotes.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = quotes.map(clip => {
    const citation = clip.citations ? clip.citations[style] : clip.url;
    return `
      <div class="quote-item">
        <div class="quote-text">"${escapeHtml(clip.text.slice(0, 300))}"</div>
        <div class="quote-source">${escapeHtml(citation)}</div>
      </div>
    `;
  }).join('');
}

async function downloadBibOnly() {
  const license = await chrome.runtime.sendMessage({ action: 'getLicenseStatus' });
  if (!license.isPro) {
    const check = await chrome.runtime.sendMessage({ action: 'checkCanBibliography' });
    if (!check.allowed) {
      showResearchStatus('🔒 ' + check.reason, 'error');
      return;
    }
  }

  if (!currentFolderId) {
    showResearchStatus('Select a project first.', 'error');
    return;
  }

  const style = document.getElementById('research-citation-style').value;
  const folderClips = allClips.filter(c => c.folder === currentFolderId);

  const citations = folderClips
    .filter(c => c.citations && c.citations[style])
    .map(c => c.citations[style])
    .sort((a, b) => a.localeCompare(b));

  const unique = [...new Set(citations)];

  if (unique.length === 0) {
    showResearchStatus('No citations found. Try re-clipping sources.', 'error');
    return;
  }

  const text = unique.join('\n\n');
  const folder = researchFolders.find(f => f.id === currentFolderId);
  const folderName = folder ? folder.name.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, '-').toLowerCase() : 'bibliography';

  const dataUrl = 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(text)));
  await chrome.downloads.download({
    url: dataUrl,
    filename: `InstantSnap/research/${folderName}-bibliography-${style}.txt`,
    saveAs: false
  });

  showResearchStatus(`✅ Bibliography downloaded (${unique.length} sources, ${style.toUpperCase()}).`, 'success');
  // Track usage for free tier
  await chrome.runtime.sendMessage({ action: 'incrementUsage', type: 'bibliographies' });
}

async function exportResearch() {
  const license = await chrome.runtime.sendMessage({ action: 'getLicenseStatus' });

  if (!currentFolderId) {
    showResearchStatus('Select a project first.', 'error');
    return;
  }

  const style = document.getElementById('research-citation-style').value;

  // Bibliography Only: 1 free per day, unlimited Pro
  if (selectedResearchMode === 'bibliography') {
    if (!license.isPro) {
      const check = await chrome.runtime.sendMessage({ action: 'checkCanBibliography' });
      if (!check.allowed) {
        showResearchStatus('🔒 ' + check.reason, 'error');
        return;
      }
    }
    await downloadBibOnly();
    return;
  }

  // All other export modes: Pro only
  if (!license.isPro) {
    showResearchStatus('🔒 Research export (Outline, Summarize, etc.) is a Pro feature. Bibliography Only is available 1/day on free.', 'error');
    return;
  }

  const btn = document.getElementById('btn-research-export');
  btn.disabled = true;
  btn.textContent = '⏳ Building...';

  const result = await chrome.runtime.sendMessage({
    action: 'buildResearchPrompt',
    folderId: currentFolderId,
    mode: selectedResearchMode,
    style
  });

  if (result.success) {
    const folder = researchFolders.find(f => f.id === currentFolderId);
    const folderName = folder ? folder.name.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, '-').toLowerCase() : 'research';
    const dataUrl = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(result.prompt)));

    await chrome.downloads.download({
      url: dataUrl,
      filename: `InstantSnap/research/${folderName}-${selectedResearchMode}.md`,
      saveAs: false
    });

    const pasteMsg = 'Follow the instructions in the attached file.';
    try {
      await navigator.clipboard.writeText(pasteMsg);
      showResearchStatus(`✅ Downloaded! Paste this into your AI: "${pasteMsg}" (${result.clipCount} sources)`, 'success');
    } catch (e) {
      showResearchStatus(`✅ Downloaded! Type this into your AI: "${pasteMsg}" (${result.clipCount} sources)`, 'success');
    }
  } else {
    showResearchStatus('❌ ' + (result.error || 'Export failed.'), 'error');
  }

  btn.disabled = false;
  btn.textContent = '💾 Build & Download Research Prompt';
}

function showResearchStatus(msg, type) {
  const el = document.getElementById('research-export-status');
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// --- Helpers ---

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
