// Background service worker for Inst-AI-nt Snap

// Import modules
importScripts('license.js');
importScripts('citations.js');

// Apply extension update when available (reload service worker cleanly)
chrome.runtime.onUpdateAvailable.addListener(() => {
  // Stop auto-capture before reloading to avoid orphaned state
  chrome.storage.local.get('autoCaptureState').then(({ autoCaptureState }) => {
    if (autoCaptureState && autoCaptureState.active) {
      chrome.storage.local.set({
        autoCaptureState: { ...autoCaptureState, active: false }
      });
    }
  });
  chrome.runtime.reload();
});

// Stop auto-capture on browser restart (cold start = fresh session)
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('autoCaptureState').then(({ autoCaptureState }) => {
    if (autoCaptureState && autoCaptureState.active) {
      chrome.storage.local.set({
        autoCaptureState: { active: false, rules: autoCaptureState.rules || [], capturedUrls: [] }
      });
      chrome.storage.local.remove('autoCaptureTimeTracks');
    }
  });
});

// Context menu for selection-based capture
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'snap-selection',
    title: '⚡ Snap Selection',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'snap-page',
    title: '⚡ Snap This Page',
    contexts: ['page']
  });

  // Set up weekly license re-validation alarm
  chrome.alarms.create('licenseCheck', { periodInMinutes: 60 * 24 }); // daily

  // Show welcome page on first install
  if (details.reason === 'install') {
    chrome.storage.local.set({ installed_at: Date.now() });
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'snap-selection') {
    // Get citation metadata from the page
    let citationMeta = null;
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          var author = '';
          var el = document.querySelector('meta[name="author"]') || document.querySelector('meta[property="article:author"]');
          if (el) author = el.getAttribute('content') || '';
          if (!author) {
            el = document.querySelector('[rel="author"], .author-name, .byline, .byline__name, [data-testid="byline"], .article-author');
            if (el) {
              var t = '';
              for (var n of el.childNodes) { if (n.nodeType === 3) t += n.textContent; }
              author = t.trim() || el.textContent.trim();
              if (author.length > 60 || /share|save|ago|follow/i.test(author)) author = '';
            }
          }
          if (!author) {
            var scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (var i = 0; i < scripts.length; i++) {
              try {
                var json = JSON.parse(scripts[i].textContent);
                var a = json.author;
                if (a) { author = Array.isArray(a) ? a[0].name || '' : (a.name || (typeof a === 'string' ? a : '')); break; }
              } catch(e){}
            }
          }
          var date = '';
          el = document.querySelector('meta[property="article:published_time"]') || document.querySelector('meta[name="date"]');
          if (el) date = el.getAttribute('content') || '';
          if (!date) { el = document.querySelector('time[datetime]'); if (el) date = el.getAttribute('datetime') || ''; }
          var siteName = (document.querySelector('meta[property="og:site_name"]') || {}).getAttribute && document.querySelector('meta[property="og:site_name"]').getAttribute('content') || '';
          return {
            author: author,
            date: date,
            title: document.title.replace(/\s*[-|–—]\s*[^-|–—]*$/, '').trim(),
            siteName: siteName,
            publisher: '',
            url: window.location.href,
            accessDate: new Date().toISOString().split('T')[0]
          };
        }
      });
      citationMeta = result;
    } catch (e) {}

    const data = {
      title: `Selection from: ${tab.title}`,
      url: tab.url,
      text: info.selectionText.trim(),
      images: [],
      isQuote: true,
      citationMeta
    };
    const result = await saveClip(data);
    if (result.success) {
      showBadge('✓', '#4ade80');
    } else if (result.limitReached) {
      showBadge('🔒', '#f87171');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Daily Limit Reached',
        message: 'Free tier: 5 clips/day. Upgrade to Pro for unlimited clips.'
      });
    }
  }

  if (info.menuItemId === 'snap-page') {
    try {
      const { settings = {} } = await chrome.storage.local.get('settings');
      const maxImages = settings.maxImages || 20;
      const [{ result: pageData }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageFromContext,
        args: [maxImages]
      });
      const result = await saveClip(pageData);
      if (result.success) {
        showBadge('✓', '#4ade80');
      } else if (result.limitReached) {
        showBadge('🔒', '#f87171');
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Daily Limit Reached',
          message: 'Free tier: 5 clips/day. Upgrade to Pro for unlimited clips.'
        });
      }
    } catch (err) {
      showBadge('✗', '#f87171');
    }
  }
});

function showBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}

// Keyboard shortcut handler
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'snap-page') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.startsWith('http')) {
        showBadge('✗', '#f87171');
        return;
      }
      const { settings = {} } = await chrome.storage.local.get('settings');
      const maxImages = settings.maxImages || 20;
      const [{ result: pageData }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageFromContext,
        args: [maxImages]
      });
      const result = await saveClip(pageData);
      if (result.success) {
        showBadge('✓', '#4ade80');
      } else if (result.limitReached) {
        showBadge('🔒', '#f87171');
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Daily Limit Reached',
          message: 'Free tier: 5 clips/day. Upgrade to Pro for unlimited clips.'
        });
      }
    } catch (err) {
      showBadge('✗', '#f87171');
    }
  }
});

// Injected into the page for context menu full-page capture
function extractPageFromContext(maxImages) {
  const imageLimit = maxImages || 20;
  const selectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.entry-content'];
  let text = '';
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.trim().length > 200) {
      text = el.innerText.trim();
      break;
    }
  }
  if (!text) {
    const clone = document.body.cloneNode(true);
    ['script','style','nav','header','footer','aside'].forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });
    text = clone.innerText.replace(/\t/g, ' ').replace(/ +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  const images = [];
  document.querySelectorAll('img').forEach(img => {
    const src = img.src || img.dataset.src;
    if (src && !src.startsWith('data:') && (img.naturalWidth > 100 || img.width > 100)) {
      images.push(src);
    }
  });

  return {
    title: document.title,
    url: window.location.href,
    text,
    images: images.slice(0, imageLimit),
    citationMeta: (function() {
      var author = '';
      var el = document.querySelector('meta[name="author"]') || document.querySelector('meta[property="article:author"]');
      if (el) author = el.getAttribute('content') || '';
      if (!author) {
        el = document.querySelector('[rel="author"], .author-name, .byline, .byline__name, [data-testid="byline"], .article-author');
        if (el) {
          // Only take the direct text, not child elements' text
          var text = '';
          for (var node of el.childNodes) {
            if (node.nodeType === 3) text += node.textContent;
          }
          author = text.trim() || el.textContent.trim();
          // Clean up — if it's too long or has junk, it's probably not just the author
          if (author.length > 60 || /share|save|ago|follow/i.test(author)) {
            author = '';
          }
        }
      }
      if (!author) {
        var scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (var i = 0; i < scripts.length; i++) {
          try {
            var json = JSON.parse(scripts[i].textContent);
            var a = json.author;
            if (a) { author = Array.isArray(a) ? a[0].name || '' : (a.name || (typeof a === 'string' ? a : '')); break; }
            if (json['@graph']) {
              for (var g of json['@graph']) {
                if (g.author) { author = g.author.name || (typeof g.author === 'string' ? g.author : ''); break; }
              }
            }
          } catch(e){}
        }
      }

      var date = '';
      el = document.querySelector('meta[property="article:published_time"]') || document.querySelector('meta[name="date"]') || document.querySelector('meta[name="pubdate"]');
      if (el) date = el.getAttribute('content') || '';
      if (!date) { el = document.querySelector('time[datetime]'); if (el) date = el.getAttribute('datetime') || ''; }

      var siteName = '';
      el = document.querySelector('meta[property="og:site_name"]');
      if (el) siteName = el.getAttribute('content') || '';

      var publisher = '';
      el = document.querySelector('meta[property="article:publisher"]') || document.querySelector('meta[name="publisher"]');
      if (el) publisher = el.getAttribute('content') || '';

      return {
        author: author,
        date: date,
        title: document.title.replace(/\s*[-|–—]\s*[^-|–—]*$/, '').trim(),
        siteName: siteName,
        publisher: publisher,
        url: window.location.href,
        accessDate: new Date().toISOString().split('T')[0]
      };
    })()
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveClip') {
    saveClip(message.data).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'getClips') {
    getClips().then(clips => {
      sendResponse({ success: true, clips });
    });
    return true;
  }

  if (message.action === 'deleteClip') {
    deleteClip(message.id).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'summarizeClip') {
    summarizeClip(message.id).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'exportClip') {
    exportClip(message.id, message.format).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.local.get('settings').then(({ settings = {} }) => {
      sendResponse({ success: true, settings });
    });
    return true;
  }

  if (message.action === 'checkCanClip') {
    canClip().then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'checkCanPrompt') {
    canBuildPrompt().then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'checkCanBibliography') {
    canExportBibliography().then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'checkCanSession') {
    canCaptureSession().then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'checkCanAutoCapture') {
    canUseAutoCapture().then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'checkCanDeepCapture') {
    canUseDeepCapture().then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'checkCanSummarize') {
    canSummarize().then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'activateLicense') {
    activateLicenseKey(message.key).then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'deactivateLicense') {
    deactivateLicense().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getLicenseStatus') {
    getLicenseStatus().then(license => sendResponse(license));
    return true;
  }

  if (message.action === 'getUsage') {
    getUsageToday().then(usage => sendResponse(usage));
    return true;
  }

  if (message.action === 'incrementUsage') {
    incrementUsage(message.type).then(usage => sendResponse({ success: true, usage }));
    return true;
  }

  // Research features
  if (message.action === 'getFolders') {
    getFolders().then(folders => sendResponse({ success: true, folders }));
    return true;
  }

  if (message.action === 'createFolder') {
    createFolder(message.name).then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'deleteFolder') {
    deleteFolder(message.folderId).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'assignFolder') {
    assignClipToFolder(message.clipId, message.folderId).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'updateNotes') {
    updateClipNotes(message.clipId, message.notes).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'toggleQuote') {
    toggleQuote(message.clipId).then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'getBibliography') {
    getBibliography(message.folderId, message.style).then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'buildResearchPrompt') {
    buildResearchPrompt(message.folderId, message.mode, message.style).then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'searchClips') {
    searchClips(message.query).then(results => {
      sendResponse({ success: true, results });
    });
    return true;
  }

  if (message.action === 'buildPrompt') {
    buildPrompt(message.clipIds, message.instruction).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'captureSession') {
    captureSession(message.tabIds).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'startAutoCapture') {
    startAutoCapture(message.rules).then((result) => {
      sendResponse(result || { success: true });
    });
    return true;
  }

  if (message.action === 'stopAutoCapture') {
    stopAutoCapture();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getAutoCaptureStatus') {
    chrome.storage.local.get('autoCaptureState').then(({ autoCaptureState = null }) => {
      sendResponse({
        active: autoCaptureState ? autoCaptureState.active : false,
        rules: autoCaptureState ? autoCaptureState.rules : []
      });
    });
    return true;
  }
});

async function saveClip(data) {
  // Check daily limit
  const clipCheck = await canClip();
  if (!clipCheck.allowed) {
    return { success: false, error: clipCheck.reason, limitReached: true };
  }

  const clip = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    url: data.url,
    title: data.title,
    text: data.text,
    images: data.images || [],
    tags: data.tags || [],
    pageType: data.pageType || 'general',
    folder: data.folder || null,
    notes: '',
    isQuote: data.isQuote || false,
    wordCount: (data.text || '').split(/\s+/).filter(Boolean).length,
    citationMeta: data.citationMeta || null,
    citations: null,
    createdAt: new Date().toISOString(),
    summary: null
  };

  const { clips = [] } = await chrome.storage.local.get('clips');

  // Generate citations (after clip object is created)
  try {
    if (clip.citationMeta && (clip.citationMeta.url || clip.citationMeta.title)) {
      clip.citations = {
        apa: generateCitation(clip.citationMeta, 'apa'),
        mla: generateCitation(clip.citationMeta, 'mla'),
        harvard: generateCitation(clip.citationMeta, 'harvard'),
        chicago: generateCitation(clip.citationMeta, 'chicago')
      };
    }
  } catch (e) {
    // Citation generation failed — save without citations
    clip.citations = null;
  }

  clips.unshift(clip);
  try {
    await chrome.storage.local.set({ clips });
  } catch (err) {
    return { success: false, error: 'Storage write failed. Your browser storage may be full.' };
  }

  // Track usage
  await incrementUsage('clips');

  // Auto-download as markdown if enabled (Pro only)
  const { settings = {} } = await chrome.storage.local.get('settings');
  const license = await getLicenseStatus();
  if (settings.autoExport && license.isPro) {
    const clipFolder = `InstantSnap/exports/${sanitizeFilename(clip.title)}`;

    // Download images if enabled
    const localImages = [];
    if (settings.downloadImages !== false && clip.images.length > 0) {
      for (let i = 0; i < clip.images.length; i++) {
        const imgUrl = clip.images[i];
        const ext = getImageExtension(imgUrl);
        const imgFilename = `${clipFolder}/images/image-${i + 1}${ext}`;
        try {
          await chrome.downloads.download({
            url: imgUrl,
            filename: imgFilename,
            saveAs: false
          });
          localImages.push(`images/image-${i + 1}${ext}`);
        } catch (err) {
          localImages.push(imgUrl);
        }
      }
    }

    // Generate markdown
    const markdown = (settings.downloadImages !== false && localImages.length > 0)
      ? formatAsMarkdownLocal(clip, localImages)
      : formatAsMarkdown(clip);
    const dataUrl = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(markdown)));

    await chrome.downloads.download({
      url: dataUrl,
      filename: `${clipFolder}/${sanitizeFilename(clip.title)}.md`,
      saveAs: false
    });
  }

  return { success: true, clip };
}

async function getClips() {
  const { clips = [] } = await chrome.storage.local.get('clips');
  return clips;
}

async function deleteClip(id) {
  const { clips = [] } = await chrome.storage.local.get('clips');
  const filtered = clips.filter(c => c.id !== id);
  await chrome.storage.local.set({ clips: filtered });
}

async function summarizeClip(id) {
  // Pro only
  const summarizeCheck = await canSummarize();
  if (!summarizeCheck.allowed) {
    return { success: false, error: summarizeCheck.reason, limitReached: true };
  }

  const { clips = [] } = await chrome.storage.local.get('clips');
  const { settings = {} } = await chrome.storage.local.get('settings');

  const clip = clips.find(c => c.id === id);
  if (!clip) return { success: false, error: 'Clip not found' };

  if (!settings.apiKey || !settings.aiProvider) {
    return { success: false, error: 'No API key configured. Add one in settings.' };
  }

  try {
    const summary = await callAI(settings, clip.text, clip.title);
    clip.summary = summary;
    await chrome.storage.local.set({ clips });
    return { success: true, summary };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function callAI(settings, text, title) {
  const truncatedText = text.slice(0, 8000); // limit tokens sent
  const prompt = `Summarize the following web page content. Provide a concise summary with key points.\n\nTitle: ${title}\n\nContent:\n${truncatedText}`;

  if (settings.aiProvider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  }

  if (settings.aiProvider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: settings.model || 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
  }

  if (settings.aiProvider === 'gemini') {
    const model = settings.model || 'gemini-2.0-flash-lite';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 500 }
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error('Unsupported AI provider');
}

async function exportClip(id, format = 'markdown') {
  const { clips = [] } = await chrome.storage.local.get('clips');
  const { settings = {} } = await chrome.storage.local.get('settings');
  const clip = clips.find(c => c.id === id);
  if (!clip) return { success: false, error: 'Clip not found' };

  if (format === 'markdown-with-images') {
    const clipFolder = `InstantSnap/exports/${sanitizeFilename(clip.title)}`;

    // Download images if enabled in settings
    const localImages = [];
    if (settings.downloadImages !== false && clip.images.length > 0) {
      for (let i = 0; i < clip.images.length; i++) {
        const imgUrl = clip.images[i];
        const ext = getImageExtension(imgUrl);
        const imgFilename = `${clipFolder}/images/image-${i + 1}${ext}`;
        try {
          await chrome.downloads.download({
            url: imgUrl,
            filename: imgFilename,
            saveAs: false
          });
          localImages.push(`images/image-${i + 1}${ext}`);
        } catch (err) {
          localImages.push(imgUrl);
        }
      }
    }

    const markdown = (settings.downloadImages !== false && localImages.length > 0)
      ? formatAsMarkdownLocal(clip, localImages)
      : formatAsMarkdown(clip);
    const dataUrl = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(markdown)));
    await chrome.downloads.download({
      url: dataUrl,
      filename: `${clipFolder}/${sanitizeFilename(clip.title)}.md`,
      saveAs: false
    });

    return { success: true, downloaded: true };
  }

  let content;
  if (format === 'markdown') {
    content = formatAsMarkdown(clip);
  } else {
    content = JSON.stringify(clip, null, 2);
  }

  return { success: true, content, filename: `${sanitizeFilename(clip.title)}.${format === 'markdown' ? 'md' : 'json'}` };
}

function formatAsMarkdown(clip) {
  let md = `# ${clip.title}\n\n`;
  md += `**Source:** ${clip.url}\n`;
  md += `**Captured:** ${new Date(clip.createdAt).toLocaleString()}\n`;
  if (clip.tags.length) md += `**Tags:** ${clip.tags.join(', ')}\n`;
  md += `\n---\n\n`;
  if (clip.summary) {
    md += `## Summary\n\n${clip.summary}\n\n---\n\n`;
  }
  md += `## Content\n\n${clip.text}\n`;
  if (clip.images.length) {
    md += `\n## Images\n\n`;
    clip.images.forEach((img, i) => {
      md += `![Image ${i + 1}](${img})\n`;
    });
  }
  return md;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9\s\-]/gi, '').replace(/\s+/g, '-').slice(0, 50).toLowerCase();
}

function getImageExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|avif)(\?|$)/i);
    if (match) return '.' + match[1].toLowerCase();
  } catch (e) {}
  return '.png'; // default fallback
}

// --- Full-text Search ---

async function searchClips(query) {
  const { clips = [] } = await chrome.storage.local.get('clips');
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return clips.filter(clip => {
    const searchable = `${clip.title} ${clip.text} ${clip.url} ${(clip.tags || []).join(' ')} ${clip.summary || ''}`.toLowerCase();
    return terms.every(term => searchable.includes(term));
  }).map(clip => ({
    id: clip.id,
    title: clip.title,
    url: clip.url,
    createdAt: clip.createdAt,
    snippet: getSnippet(clip.text, terms[0]),
    pageType: clip.pageType || 'general'
  }));
}

function getSnippet(text, term) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term);
  if (idx === -1) return text.slice(0, 150) + '...';
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + 90);
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
}

// --- Multi-clip AI Prompt Builder ---

async function buildPrompt(clipIds, instruction) {
  // Check daily limit
  const promptCheck = await canBuildPrompt();
  if (!promptCheck.allowed) {
    return { success: false, error: promptCheck.reason, limitReached: true };
  }

  const { clips = [] } = await chrome.storage.local.get('clips');
  const selected = clips.filter(c => clipIds.includes(c.id));

  if (selected.length === 0) return { success: false, error: 'No clips selected' };

  // Expand short instructions into proper AI prompts
  const expandedInstruction = expandInstruction(instruction, selected);

  let prompt = `# TASK: ${expandedInstruction}\n\n`;
  prompt += `**Read the sources below and complete the task above. Respond immediately with your analysis.**\n\n`;

  // No character limit — include full text from each clip
  selected.forEach((clip, i) => {
    const cleanedText = cleanClipText(clip.text);

    prompt += `---\n\n`;
    prompt += `### Source ${i + 1}: ${clip.title}\n`;
    prompt += `- **URL:** ${clip.url}\n`;
    prompt += `- **Captured:** ${new Date(clip.createdAt).toLocaleDateString()}\n\n`;
    prompt += cleanedText;
    prompt += '\n\n';
  });

  prompt += `---\n\n`;
  prompt += `**END OF SOURCES. Now complete the task: ${expandedInstruction}**`;

  await incrementUsage('prompts');
  return { success: true, prompt, clipCount: selected.length };
}

function expandInstruction(instruction, clips) {
  const trimmed = instruction.trim().toLowerCase();
  const titles = clips.map(c => `"${c.title}"`).join(', ');

  // If the instruction is very short/vague, expand it into a proper task
  if (trimmed.length < 20) {
    const expansions = {
      'compare': `Compare and contrast the following ${clips.length} sources (${titles}). Identify key similarities and differences. Present your comparison in a structured format with clear categories.`,
      'summarize': `Provide a comprehensive summary of the following ${clips.length} sources (${titles}). Highlight the most important information from each, then provide an overall synthesis.`,
      'summarise': `Provide a comprehensive summary of the following ${clips.length} sources (${titles}). Highlight the most important information from each, then provide an overall synthesis.`,
      'combine': `Combine the information from the following ${clips.length} sources (${titles}) into a single, coherent document. Remove redundancies and organize logically.`,
      'key points': `Extract the key points and takeaways from the following ${clips.length} sources (${titles}). Present them as a structured list grouped by topic.`,
      'differences': `Analyze the key differences between the following ${clips.length} sources (${titles}). Present findings in a clear, structured format.`,
      'pros and cons': `Analyze the pros and cons presented across the following ${clips.length} sources (${titles}). Create a balanced comparison.`,
      'timeline': `Create a chronological timeline of events mentioned across the following ${clips.length} sources (${titles}).`,
      'explain': `Using the following ${clips.length} sources (${titles}), provide a clear explanation of the topic. Synthesize information from all sources into an easy-to-understand overview.`,
    };

    for (const [key, expanded] of Object.entries(expansions)) {
      if (trimmed === key || trimmed.startsWith(key)) {
        return expanded;
      }
    }

    // Generic expansion for other short instructions
    return `Task: ${instruction}\n\nUsing the ${clips.length} sources provided below (${titles}), complete this task thoroughly. Provide a well-structured response.`;
  }

  // If instruction is already detailed, use it as-is with light framing
  return `Task: ${instruction}\n\nUse the ${clips.length} sources provided below to complete this task.`;
}

function cleanClipText(text) {
  // Remove Wikipedia donation banners, navigation cruft, etc.
  let cleaned = text;

  // Remove common Wikipedia noise
  const noisePatterns = [
    /\d+ languages.*?Article Talk Read.*?(?:Dark|Light)\s*/gs,
    /Sorry to interrupt.*?CLOSE\s*/gs,
    /\d+ July:.*?CLOSE\s*/gs,
    /Wikipedia still can't be sold.*?CLOSE\s*/gs,
    /Give R \d+.*?CLOSE\s*/gs,
    /MAYBE LATER.*?CLOSE\s*/gs,
    /I ALREADY DONATED\s*/g,
    /Show globe Show map.*?\s*/g,
    /Duration: \d+ minute.*?\d+:\d+\s*/g,
    /Appearance hide Text Small.*?Dark\s*/gs,
  ];

  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Clean up excessive whitespace left behind
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

// --- Session Capture (all open tabs) ---

async function captureSession(tabIds) {
  // Check daily limit
  const sessionCheck = await canCaptureSession();
  if (!sessionCheck.allowed) {
    return { success: false, error: sessionCheck.reason, limitReached: true };
  }

  let tabs;
  if (tabIds && tabIds.length > 0) {
    tabs = await Promise.all(tabIds.map(id => chrome.tabs.get(id)));
  } else {
    tabs = await chrome.tabs.query({ currentWindow: true });
  }

  // Filter out chrome:// and extension pages
  const capturableTabs = tabs.filter(t => t.url && t.url.startsWith('http'));
  const results = { captured: 0, failed: 0, clips: [] };
  const { settings = {} } = await chrome.storage.local.get('settings');
  const maxImages = settings.maxImages || 20;

  for (const tab of capturableTabs) {
    try {
      const [{ result: pageData }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageFromContext,
        args: [maxImages]
      });

      if (pageData && pageData.text) {
        const saveResult = await saveClip(pageData);
        if (saveResult.success) {
          results.captured++;
          results.clips.push(saveResult.clip.id);
        } else {
          results.failed++;
        }
      } else {
        results.failed++;
      }
    } catch (err) {
      results.failed++;
    }
  }

  await incrementUsage('sessions');
  return { success: true, ...results, total: capturableTabs.length };
}

// --- Auto Capture ---

// Restore auto-capture state on service worker start
(async function restoreAutoCapture() {
  const { autoCaptureState = null } = await chrome.storage.local.get('autoCaptureState');
  if (autoCaptureState && autoCaptureState.active) {
    // Re-register listeners on wake
    registerAutoCaptureListeners();
  }
})();

async function startAutoCapture(rules) {
  // Pro only
  const check = await canUseAutoCapture();
  if (!check.allowed) {
    return { success: false, error: check.reason, limitReached: true };
  }

  // Persist to storage so it survives service worker restarts
  await chrome.storage.local.set({
    autoCaptureState: { active: true, rules, capturedUrls: [] }
  });

  registerAutoCaptureListeners();

  // Set up alarm for time-based capture checks
  const timeRule = rules.find(r => r.type === 'time');
  if (timeRule) {
    const checkInterval = Math.max(0.1, Math.min(timeRule.value / 3, 30)); // seconds
    await chrome.alarms.create('autoCapture-timeCheck', { delayInMinutes: checkInterval / 60 });
  }
}

function stopAutoCapture() {
  chrome.storage.local.set({
    autoCaptureState: { active: false, rules: [], capturedUrls: [] }
  });
  chrome.alarms.clear('autoCapture-timeCheck');
  chrome.webNavigation.onCompleted.removeListener(autoCaptureNavListener);
}

function registerAutoCaptureListeners() {
  // Remove first to avoid duplicates
  chrome.webNavigation.onCompleted.removeListener(autoCaptureNavListener);
  chrome.webNavigation.onCompleted.addListener(autoCaptureNavListener, {
    url: [{ schemes: ['http', 'https'] }]
  });
}

// Fires reliably when a page finishes loading
async function autoCaptureNavListener(details) {
  // Only main frame, not iframes
  if (details.frameId !== 0) return;

  const { autoCaptureState = null } = await chrome.storage.local.get('autoCaptureState');
  if (!autoCaptureState || !autoCaptureState.active) return;

  const rules = autoCaptureState.rules;
  const capturedUrls = autoCaptureState.capturedUrls || [];
  const url = details.url;

  // Skip if already captured
  if (capturedUrls.includes(url)) return;

  // Check domain rule
  const domainRule = rules.find(r => r.type === 'domain');
  if (domainRule && domainRule.value) {
    try {
      const hostname = new URL(url).hostname;
      if (!hostname.includes(domainRule.value)) {
        // Domain doesn't match — still track for time-based capture
        await trackTabForTime(details.tabId, url);
        return;
      }
    } catch (e) { return; }

    // Domain matches — capture it
    await performAutoCapture(details.tabId, url, autoCaptureState);
  } else {
    // No domain rule — track for time-based only
    await trackTabForTime(details.tabId, url);
  }
}

async function trackTabForTime(tabId, url) {
  const { autoCaptureTimeTracks = {} } = await chrome.storage.local.get('autoCaptureTimeTracks');
  if (!autoCaptureTimeTracks[tabId] || autoCaptureTimeTracks[tabId].url !== url) {
    autoCaptureTimeTracks[tabId] = { url, startTime: Date.now(), captured: false };
    await chrome.storage.local.set({ autoCaptureTimeTracks });
  }
}

async function performAutoCapture(tabId, url, state) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const maxImages = settings.maxImages || 20;

  try {
    const [{ result: pageData }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageFromContext,
      args: [maxImages]
    });

    if (pageData && pageData.text && pageData.text.length > 100) {
      await saveClip(pageData);
      showBadge('⚡', '#667eea');

      // Mark as captured
      const capturedUrls = state.capturedUrls || [];
      capturedUrls.push(url);
      if (capturedUrls.length > 200) capturedUrls.shift();
      await chrome.storage.local.set({
        autoCaptureState: { ...state, capturedUrls }
      });
    }
  } catch (err) {
    // Silently fail — tab may have closed or be restricted
  }
}

// Alarm handler for time-based captures
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'licenseCheck') {
    await checkLicenseValidity();
    return;
  }

  if (alarm.name !== 'autoCapture-timeCheck') return;

  const { autoCaptureState = null } = await chrome.storage.local.get('autoCaptureState');
  if (!autoCaptureState || !autoCaptureState.active) return;

  const timeRule = autoCaptureState.rules.find(r => r.type === 'time');
  if (!timeRule) return;

  const threshold = (timeRule.value || 120) * 1000;
  const now = Date.now();

  const { autoCaptureTimeTracks = {} } = await chrome.storage.local.get('autoCaptureTimeTracks');
  const capturedUrls = autoCaptureState.capturedUrls || [];
  let changed = false;

  for (const [tabId, info] of Object.entries(autoCaptureTimeTracks)) {
    if (info.captured) continue;
    if (capturedUrls.includes(info.url)) continue;
    if (now - info.startTime < threshold) continue;

    // Time threshold met — check if tab still has same URL
    try {
      const tab = await chrome.tabs.get(parseInt(tabId));
      if (tab && tab.url === info.url) {
        await performAutoCapture(parseInt(tabId), info.url, autoCaptureState);
        autoCaptureTimeTracks[tabId].captured = true;
        changed = true;
      }
    } catch (e) {
      // Tab may have closed
      delete autoCaptureTimeTracks[tabId];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ autoCaptureTimeTracks });
  }

  // Re-schedule next check — use shorter interval for short thresholds
  const checkInterval = Math.max(0.1, Math.min(threshold / 1000 / 3, 30)); // seconds
  await chrome.alarms.create('autoCapture-timeCheck', { delayInMinutes: checkInterval / 60 });
});

// --- Research Features ---

async function getFolders() {
  const { researchFolders = [] } = await chrome.storage.local.get('researchFolders');
  return researchFolders;
}

async function createFolder(name) {
  const { researchFolders = [] } = await chrome.storage.local.get('researchFolders');
  const license = await getLicenseStatus();

  if (!license.isPro && researchFolders.length >= 1) {
    return { success: false, error: 'Free tier allows 1 research folder. Upgrade for unlimited.', limitReached: true };
  }

  const folder = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name,
    createdAt: new Date().toISOString()
  };

  researchFolders.push(folder);
  await chrome.storage.local.set({ researchFolders });
  return { success: true, folder };
}

async function deleteFolder(folderId) {
  const { researchFolders = [] } = await chrome.storage.local.get('researchFolders');
  const filtered = researchFolders.filter(f => f.id !== folderId);
  await chrome.storage.local.set({ researchFolders: filtered });

  const { clips = [] } = await chrome.storage.local.get('clips');
  clips.forEach(clip => {
    if (clip.folder === folderId) clip.folder = null;
  });
  await chrome.storage.local.set({ clips });
}

async function assignClipToFolder(clipId, folderId) {
  const { clips = [] } = await chrome.storage.local.get('clips');
  const clip = clips.find(c => c.id === clipId);
  if (clip) {
    clip.folder = folderId;
    await chrome.storage.local.set({ clips });
  }
}

async function updateClipNotes(clipId, notes) {
  const license = await getLicenseStatus();
  if (!license.isPro) return;

  const { clips = [] } = await chrome.storage.local.get('clips');
  const clip = clips.find(c => c.id === clipId);
  if (clip) {
    clip.notes = notes;
    await chrome.storage.local.set({ clips });
  }
}

async function toggleQuote(clipId) {
  const { clips = [] } = await chrome.storage.local.get('clips');
  const clip = clips.find(c => c.id === clipId);
  if (clip) {
    clip.isQuote = !clip.isQuote;
    await chrome.storage.local.set({ clips });
    return { success: true, isQuote: clip.isQuote };
  }
  return { success: false };
}

async function getBibliography(folderId, style = 'apa') {
  const license = await getLicenseStatus();
  if (!license.isPro) {
    return { success: false, error: 'Bibliography export is a Pro feature.', limitReached: true };
  }

  const { clips = [] } = await chrome.storage.local.get('clips');
  const folderClips = folderId ? clips.filter(c => c.folder === folderId) : clips;

  const citations = folderClips
    .filter(c => c.citations && c.citations[style])
    .map(c => c.citations[style])
    .sort((a, b) => a.localeCompare(b));

  const unique = [...new Set(citations)];
  const bibliography = unique.join('\n\n');
  return { success: true, bibliography, count: unique.length };
}

async function buildResearchPrompt(folderId, mode, style = 'apa') {
  const promptCheck = await canBuildPrompt();
  if (!promptCheck.allowed) {
    return { success: false, error: promptCheck.reason, limitReached: true };
  }

  const { clips = [] } = await chrome.storage.local.get('clips');
  const folderClips = folderId ? clips.filter(c => c.folder === folderId) : clips;
  const { researchFolders = [] } = await chrome.storage.local.get('researchFolders');
  const folder = researchFolders.find(f => f.id === folderId);
  const projectName = folder ? folder.name : 'Research';

  if (folderClips.length === 0) {
    return { success: false, error: 'No sources in this project.' };
  }

  const modeInstructions = {
    'outline': `Create a detailed essay outline based on the research sources below. Organize the key arguments and evidence into a logical structure with introduction, body paragraphs, and conclusion. Reference which source supports each point.`,
    'summarize': `Summarize each of the research sources below individually, then provide an overall synthesis that identifies common themes, contradictions, and key findings across all sources.`,
    'arguments': `From the research sources below, identify and organize all arguments FOR and AGAINST the topic. Present them in a balanced way, noting which source each argument comes from.`,
    'paraphrase': `Paraphrase the key information from each research source below into original academic writing. Maintain the meaning but use different wording and sentence structures. Include in-text citations where appropriate.`,
    'introduction': `Using the research sources below, write an academic introduction paragraph that introduces the topic, provides context, and presents a thesis statement supported by the evidence in the sources.`
  };

  const instruction = modeInstructions[mode] || modeInstructions['outline'];

  let prompt = `# Research Assistant — ${projectName}\n\n`;
  prompt += `## Your Task\n\n${instruction}\n\n`;
  prompt += `**Citation style:** ${style.toUpperCase()}\n`;
  prompt += `**Do NOT modify the Citations section at the bottom. Use them as-is.**\n\n`;
  prompt += `---\n\n`;
  prompt += `## Sources (${folderClips.length})\n\n`;

  folderClips.forEach((clip, i) => {
    const citation = clip.citations ? clip.citations[style] : clip.url;
    const inText = clip.citationMeta ? generateInTextCitation(clip.citationMeta, style) : '';

    prompt += `### Source ${i + 1}: ${clip.title}\n`;
    prompt += `- **Citation:** ${citation}\n`;
    prompt += `- **In-text:** ${inText}\n`;
    if (clip.isQuote) {
      prompt += `- **Key Quote:** "${clip.text.slice(0, 300)}"\n`;
    }
    if (clip.notes) {
      prompt += `- **Notes:** ${clip.notes}\n`;
    }
    prompt += `\n**Content:**\n\n`;
    prompt += cleanClipText(clip.text);
    prompt += `\n\n---\n\n`;
  });

  prompt += `## Citations — DO NOT EDIT\n\nCopy these directly into your paper's reference list:\n\n`;
  const citations = folderClips
    .filter(c => c.citations && c.citations[style])
    .map(c => c.citations[style])
    .sort((a, b) => a.localeCompare(b));
  const unique = [...new Set(citations)];
  unique.forEach(c => { prompt += `${c}\n\n`; });

  prompt += `---\n\n`;
  prompt += `## Instructions for AI\n\n`;
  prompt += `- Use the sources above to complete the task\n`;
  prompt += `- Maintain academic tone\n`;
  prompt += `- Include in-text citations where you reference a source\n`;
  prompt += `- Keep all citations in the "Citations" section exactly as provided\n`;
  prompt += `- If a claim needs an additional source, flag it with [additional source needed]\n`;

  await incrementUsage('prompts');
  return { success: true, prompt, clipCount: folderClips.length };
}

// --- End Research Features ---

function formatAsMarkdownLocal(clip, localImages) {
  let md = `# ${clip.title}\n\n`;
  md += `**Source:** ${clip.url}\n`;
  md += `**Captured:** ${new Date(clip.createdAt).toLocaleString()}\n`;
  if (clip.tags.length) md += `**Tags:** ${clip.tags.join(', ')}\n`;
  md += `\n---\n\n`;
  if (clip.summary) {
    md += `## Summary\n\n${clip.summary}\n\n---\n\n`;
  }
  md += `## Content\n\n${clip.text}\n`;
  if (localImages.length) {
    md += `\n## Images\n\n`;
    localImages.forEach((img, i) => {
      md += `![Image ${i + 1}](${img})\n`;
    });
  }
  return md;
}
