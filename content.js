// Content script — Inst-AI-nt Snap
// Handles: extraction, readability, deep scroll, warnings, shadow DOM, etc.

let deepCaptureAborted = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractContent') {
    handleExtraction(message.options || {}).then(sendResponse);
    return true;
  }
  if (message.action === 'extractSelection') {
    const data = extractSelection();
    sendResponse(data);
  }
  if (message.action === 'checkPage') {
    const info = checkPageInfo();
    sendResponse(info);
  }
  if (message.action === 'abortDeepCapture') {
    deepCaptureAborted = true;
    sendResponse({ success: true });
  }
  return true;
});

// --- Main Extraction Handler ---

async function handleExtraction(options) {
  const url = window.location.href;

  // Fix #13: Detect uncapturable pages
  if (isUncapturablePage(url)) {
    return { error: 'uncapturable', message: "Can't capture browser internal pages." };
  }

  // Fix #1: Wait for JS-rendered content using MutationObserver
  await waitForContentStability();

  // Fix #2: Deep scroll if enabled
  if (options.deepCapture) {
    await deepScrollCapture();
  }

  // Extract content
  const title = document.title;
  const pageType = detectPageType();
  const structured = extractStructured(pageType);

  // Fix #10: Use Readability-style extraction for main content
  const text = structured.text || extractWithReadability() || extractText();
  const images = extractImages(options.maxImages);

  // Fix #4: Warn if content seems too short (login wall, empty page)
  const warnings = [];
  if (text.length < 200) {
    warnings.push('Content seems very short. The page may require login or be loading dynamically.');
  }

  // Fix #3: Detect paywall
  if (detectPaywall()) {
    warnings.push('This page may be behind a paywall. Captured content might be incomplete.');
  }

  // Fix #5: Detect PDF
  if (isPDF(url)) {
    return {
      title: title || 'PDF Document',
      url,
      text: 'PDF detected — text extraction not available. The PDF URL has been saved.',
      images: [],
      pageType: 'pdf',
      structured: null,
      warnings: ['PDF files cannot be directly extracted. The URL has been saved for reference.']
    };
  }

  return { title, url, text, images, pageType, structured: structured.data, warnings, citationMeta: extractCitationMeta() };
}

// --- Citation Metadata Extraction ---

function extractCitationMeta() {
  // Author - try many patterns
  let author = '';
  let el = document.querySelector('meta[name="author"]') || document.querySelector('meta[property="article:author"]');
  if (el) author = el.getAttribute('content') || '';
  if (!author) {
    el = document.querySelector('[rel="author"], .author-name, .byline, .byline__name, [data-testid="byline"], .article-author');
    if (el) {
      // Only take direct text nodes, not all child text
      let text = '';
      for (const node of el.childNodes) {
        if (node.nodeType === 3) text += node.textContent;
      }
      author = text.trim() || el.textContent.trim();
      // If too long or contains junk, discard
      if (author.length > 60 || /share|save|ago|follow/i.test(author)) {
        author = '';
      }
    }
  }
  if (!author) {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const json = JSON.parse(s.textContent);
        const a = json.author;
        if (a) { author = Array.isArray(a) ? a[0].name || '' : (a.name || (typeof a === 'string' ? a : '')); break; }
        if (json['@graph']) {
          for (const g of json['@graph']) {
            if (g.author) { author = g.author.name || (typeof g.author === 'string' ? g.author : ''); break; }
          }
        }
      } catch(e){}
    }
  }

  // Date
  let date = '';
  el = document.querySelector('meta[property="article:published_time"]') || document.querySelector('meta[name="date"]') || document.querySelector('meta[name="pubdate"]');
  if (el) date = el.getAttribute('content') || '';
  if (!date) { el = document.querySelector('time[datetime]'); if (el) date = el.getAttribute('datetime') || ''; }

  // Site name
  let siteName = '';
  el = document.querySelector('meta[property="og:site_name"]');
  if (el) siteName = el.getAttribute('content') || '';

  // Publisher
  let publisher = '';
  el = document.querySelector('meta[property="article:publisher"]') || document.querySelector('meta[name="publisher"]');
  if (el) publisher = el.getAttribute('content') || '';

  return {
    author,
    date,
    title: document.title.replace(/\s*[-|–—]\s*[^-|–—]*$/, '').trim(),
    siteName,
    publisher,
    url: window.location.href,
    accessDate: new Date().toISOString().split('T')[0]
  };
}

// --- Fix #13: Uncapturable page detection ---

function isUncapturablePage(url) {
  const blocked = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://', 'devtools://'];
  return blocked.some(prefix => url.startsWith(prefix));
}

// --- Fix #5: PDF detection ---

function isPDF(url) {
  return url.toLowerCase().endsWith('.pdf') ||
    document.contentType === 'application/pdf';
}

// --- Fix #1: Wait for JS content to stabilize ---

function waitForContentStability(timeout = 5000) {
  return new Promise(resolve => {
    let mutations = 0;
    let stableTimer = null;
    const startTime = Date.now();

    // If page already has substantial content, don't wait
    if (document.body && document.body.innerText.length > 500) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      mutations++;
      clearTimeout(stableTimer);

      // Consider stable if no mutations for 800ms
      stableTimer = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 800);
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Max timeout
    setTimeout(() => {
      observer.disconnect();
      clearTimeout(stableTimer);
      resolve();
    }, timeout);

    // If already stable (no mutations after 1s), resolve
    stableTimer = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 1000);
  });
}

// --- Fix #2: Deep Scroll Capture ---

async function deepScrollCapture() {
  deepCaptureAborted = false;
  const maxScrollTime = 60000; // 60 second max
  const scrollStep = window.innerHeight * 0.8;
  const startTime = Date.now();
  let lastHeight = document.documentElement.scrollHeight;
  let noChangeCount = 0;

  while (!deepCaptureAborted) {
    // Check time limit
    if (Date.now() - startTime > maxScrollTime) break;

    // Scroll down — try multiple methods
    window.scrollBy({ top: scrollStep, behavior: 'instant' });
    document.documentElement.scrollTop += scrollStep;
    document.body.scrollTop += scrollStep;

    // Wait for new content to load — longer delay gives lazy loaders time to fetch
    await sleep(3000);

    const newHeight = document.documentElement.scrollHeight;

    if (newHeight === lastHeight) {
      noChangeCount++;
      // Give it extra time — some sites are slow to load next batch
      if (noChangeCount < 5) {
        await sleep(2000); // extra wait before checking again
      }
      // 5 consecutive same-height checks = we've actually reached the end
      if (noChangeCount >= 5) break;
    } else {
      noChangeCount = 0;
    }

    lastHeight = newHeight;
  }

  // Scroll back to top
  window.scrollTo(0, 0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Fix #3: Paywall Detection ---

function detectPaywall() {
  const paywallSignals = [
    '.paywall', '.subscription-wall', '.piano-offer', '#gateway-content',
    '.met-slot', '[data-testid="paywall"]', '.tp-modal', '.pw-widget',
    '.subscribe-to-read', '.registration-wall'
  ];

  for (const selector of paywallSignals) {
    if (document.querySelector(selector)) return true;
  }

  // Check for common paywall text patterns
  const body = document.body.innerText.slice(0, 2000).toLowerCase();
  const paywallPhrases = [
    'subscribe to read', 'subscription required', 'sign in to continue reading',
    'become a member to read', 'this content is for subscribers',
    'already a subscriber? sign in', 'unlock this article'
  ];

  return paywallPhrases.some(phrase => body.includes(phrase));
}

// --- Page Info Check (for pre-capture warnings) ---

function checkPageInfo() {
  const url = window.location.href;
  const info = {
    isUncapturable: isUncapturablePage(url),
    isPDF: isPDF(url),
    hasPaywall: detectPaywall(),
    isLazyLoaded: detectLazyLoading(),
    contentLength: (document.body ? document.body.innerText.length : 0),
    isLoginPage: detectLoginPage()
  };
  return info;
}

function detectLazyLoading() {
  // Check for lazy loading indicators
  const lazyImages = document.querySelectorAll('img[data-src], img[loading="lazy"], img[data-lazy]');
  const infiniteScrollMarkers = document.querySelectorAll('[data-infinite-scroll], .infinite-scroll, [data-page], .load-more');
  const intersectionTargets = document.querySelectorAll('[data-observe], .lazy-load');

  return (lazyImages.length > 5 || infiniteScrollMarkers.length > 0 || intersectionTargets.length > 3);
}

function detectLoginPage() {
  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    const inputs = form.querySelectorAll('input[type="password"], input[type="email"]');
    if (inputs.length >= 1) {
      const text = form.innerText.toLowerCase();
      if (text.includes('sign in') || text.includes('log in') || text.includes('login')) {
        return true;
      }
    }
  }
  return false;
}

// --- Fix #10: Readability-style Content Extraction ---

function extractWithReadability() {
  try {
    // Clone the document to avoid modifying the live page
    const clone = document.cloneNode(true);

    // Remove noise elements
    const removeSelectors = [
      'script', 'style', 'noscript', 'nav', 'footer', 'header',
      'aside', '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
      '.sidebar', '.nav', '.menu', '.advertisement', '.ad', '.social-share',
      '.cookie-banner', '.cookie-notice', '#cookie-consent', '#onetrust-banner-sdk',
      '.gdpr', '.chat-widget', '#intercom-container', '.crisp-client',
      '[data-ad]', '.sponsor', '.promoted', '.related-articles',
      '.comments', '#comments', '.comment-section', '.newsletter-signup',
      '.popup', '.modal', '.overlay',
      // Social/share buttons
      '[data-testid="share"]', '.share-tools', '.share-buttons', '.social-links',
      '.share', '[aria-label="Share"]',
      // Save/bookmark buttons
      '.save-button', '[data-testid="save"]', '[aria-label="Save"]',
      // Image credits
      '.image-credit', '.media-caption', 'figcaption', '.photo-credit',
      // Related/recommended
      '.related', '.recommended', '.more-stories', '.also-read',
      // Timestamps as standalone elements
      '.date-header', '.timestamp',
      // "Add as preferred" type prompts
      '[data-testid="promo"]', '.promo', '.banner', '.callout',
      // Generic button/action containers
      '.actions', '.toolbar', '.btn-group', '[role="toolbar"]'
    ];

    removeSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Score content blocks to find the main article
    const candidates = scoreCandidates(clone);

    if (candidates.length > 0) {
      const best = candidates[0];
      const text = extractTextFromElement(best.element);
      if (text.length > 200) {
        return cleanText(text);
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

function scoreCandidates(doc) {
  const candidates = [];
  const blocks = doc.querySelectorAll('article, main, [role="main"], section, div');

  for (const block of blocks) {
    const text = block.innerText || '';
    if (text.length < 200) continue;

    let score = 0;

    // Reward long text content
    score += Math.min(text.length / 100, 50);

    // Reward paragraph density
    const paragraphs = block.querySelectorAll('p');
    score += paragraphs.length * 3;

    // Reward semantic elements
    if (block.tagName === 'ARTICLE') score += 30;
    if (block.tagName === 'MAIN' || block.getAttribute('role') === 'main') score += 25;

    // Reward content-related classes/IDs
    const idClass = (block.id + ' ' + block.className).toLowerCase();
    if (/article|post|content|entry|story|text|body/.test(idClass)) score += 20;

    // Penalize navigation/sidebar patterns
    if (/nav|menu|sidebar|footer|header|comment|ad|social|related/.test(idClass)) score -= 30;

    // Penalize high link density (nav-like)
    const links = block.querySelectorAll('a');
    const linkText = Array.from(links).reduce((sum, a) => sum + (a.innerText || '').length, 0);
    const linkDensity = text.length > 0 ? linkText / text.length : 0;
    if (linkDensity > 0.5) score -= 20;

    candidates.push({ element: block, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// --- Fix #7: Shadow DOM + text extraction ---

function extractTextFromElement(el) {
  let text = '';

  // Try to pierce open shadow roots
  if (el.shadowRoot) {
    text += extractTextFromElement(el.shadowRoot);
  }

  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      // Skip hidden elements
      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      // Add line breaks for block elements
      const display = style.display;
      if (/^(block|flex|grid|table|list-item)/.test(display)) {
        text += '\n';
      }

      text += extractTextFromElement(child);

      if (/^(block|flex|grid|table|list-item)/.test(display)) {
        text += '\n';
      }
    }
  }

  return text;
}

function extractSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());

  const images = [];
  container.querySelectorAll('img').forEach(img => {
    if (img.src && !img.src.startsWith('data:')) images.push(img.src);
  });

  return {
    title: `Selection from: ${document.title}`,
    url: window.location.href,
    text: container.innerText.trim(),
    images,
    pageType: 'selection',
    structured: null,
    warnings: []
  };
}

// --- Page Type Detection ---

function detectPageType() {
  const url = window.location.href;

  // Recipe detection
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const data = JSON.parse(script.textContent);
      if (data['@type'] === 'Recipe' || (Array.isArray(data['@graph']) && data['@graph'].find(i => i['@type'] === 'Recipe'))) {
        return 'recipe';
      }
    }
  } catch (e) {}

  // Product detection
  if (document.querySelector('[itemtype*="Product"]') || document.querySelector('.product-price, .price, [data-price]')) {
    return 'product';
  }

  // Code/documentation detection
  if (document.querySelectorAll('pre code, .highlight, .code-block').length > 2) {
    return 'code';
  }

  // Article detection
  const meta = document.querySelector('meta[property="og:type"]');
  if (document.querySelector('article') || (meta && meta.content === 'article')) {
    return 'article';
  }

  return 'general';
}

// --- Structured Extraction ---

function extractStructured(pageType) {
  switch (pageType) {
    case 'recipe': return extractRecipe();
    case 'product': return extractProduct();
    case 'code': return extractCode();
    case 'article': return extractArticle();
    default: return { text: null, data: null };
  }
}

function extractRecipe() {
  const data = { ingredients: [], instructions: [], prepTime: '', cookTime: '', servings: '' };

  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const json = JSON.parse(script.textContent);
      const recipe = json['@type'] === 'Recipe' ? json : (json['@graph'] || []).find(i => i['@type'] === 'Recipe');
      if (recipe) {
        data.ingredients = recipe.recipeIngredient || [];
        data.instructions = (recipe.recipeInstructions || []).map(i => typeof i === 'string' ? i : i.text);
        data.prepTime = recipe.prepTime || '';
        data.cookTime = recipe.cookTime || '';
        data.servings = recipe.recipeYield || '';
        break;
      }
    }
  } catch (e) {}

  if (data.ingredients.length === 0) {
    document.querySelectorAll('.ingredient, [itemprop="recipeIngredient"], .recipe-ingredient li').forEach(el => {
      if (el.textContent.trim()) data.ingredients.push(el.textContent.trim());
    });
  }

  let text = '## Recipe\n\n';
  if (data.prepTime) text += `**Prep:** ${data.prepTime} `;
  if (data.cookTime) text += `**Cook:** ${data.cookTime} `;
  if (data.servings) text += `**Serves:** ${data.servings}`;
  text += '\n\n### Ingredients\n';
  data.ingredients.forEach(i => { text += `- ${i}\n`; });
  text += '\n### Instructions\n';
  data.instructions.forEach((s, i) => { text += `${i + 1}. ${s}\n`; });

  return { text, data };
}

function extractProduct() {
  const data = { name: '', price: '', description: '', specs: [] };

  data.name = (document.querySelector('[itemprop="name"], .product-title, h1') || {}).textContent || '';
  data.price = (document.querySelector('[itemprop="price"], .price, .product-price, [data-price]') || {}).textContent || '';
  data.description = (document.querySelector('[itemprop="description"], .product-description') || {}).textContent || '';

  document.querySelectorAll('.specs tr, .product-specs li, .features li').forEach(el => {
    if (el.textContent.trim()) data.specs.push(el.textContent.trim());
  });

  let text = '## Product\n\n';
  text += `**Name:** ${data.name.trim()}\n`;
  text += `**Price:** ${data.price.trim()}\n\n`;
  if (data.description) text += `**Description:** ${data.description.trim()}\n\n`;
  if (data.specs.length) {
    text += '### Specifications\n';
    data.specs.forEach(s => { text += `- ${s}\n`; });
  }

  return { text, data };
}

function extractCode() {
  const data = { blocks: [] };

  document.querySelectorAll('pre code, .highlight pre, .code-block').forEach(el => {
    const lang = el.className.match(/language-(\w+)/)?.[1] || '';
    data.blocks.push({ language: lang, code: el.textContent.trim() });
  });

  let text = extractText() + '\n\n## Code Snippets\n\n';
  data.blocks.forEach((block) => {
    text += `\`\`\`${block.language}\n${block.code}\n\`\`\`\n\n`;
  });

  return { text, data };
}

function extractArticle() {
  const article = document.querySelector('article') || document.querySelector('main');
  if (!article) return { text: null, data: null };

  const data = {
    author: (document.querySelector('[rel="author"], .author, [itemprop="author"]') || {}).textContent || '',
    publishDate: (document.querySelector('time, [itemprop="datePublished"]') || {}).getAttribute?.('datetime') || '',
    headings: []
  };

  article.querySelectorAll('h2, h3').forEach(h => {
    data.headings.push({ level: h.tagName, text: h.textContent.trim() });
  });

  let text = '';
  if (data.author) text += `**Author:** ${data.author.trim()}\n`;
  if (data.publishDate) text += `**Published:** ${data.publishDate}\n`;
  text += '\n' + cleanText(article.innerText);

  return { text, data };
}

// --- Fallback Text Extraction ---

function extractText() {
  const selectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.entry-content'];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.trim().length > 200) {
      return cleanText(el.innerText);
    }
  }

  const clone = document.body.cloneNode(true);
  const removeSelectors = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '.sidebar', '.nav',
    '.menu', '.advertisement', '.ad', '.cookie-banner', '.cookie-notice',
    '#onetrust-banner-sdk', '.gdpr', '.chat-widget', '#intercom-container',
    '.crisp-client'
  ];

  removeSelectors.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Fix #11: Use textContent as fallback for anti-copy sites
  let text = clone.innerText;
  if (text.length < 100) {
    text = clone.textContent;
  }

  return cleanText(text);
}

function cleanText(text) {
  // Remove common noise lines
  const noiseLines = [
    /^Share$/m, /^Save$/m, /^Copy link$/m, /^Close$/m,
    /^Add as preferred on Google$/m, /^Follow$/m,
    /^Getty Images$/m, /^Reuters$/m, /^AP$/m, /^AFP$/m,
    /^\d+ hours? ago$/m, /^\d+ minutes? ago$/m, /^\d+ days? ago$/m,
    /^Read more$/m, /^Show more$/m, /^See also$/m,
    /^Advertisement$/m, /^Sponsored$/m,
    /^Skip to content$/m, /^Back to top$/m
  ];

  let cleaned = text;
  noiseLines.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  return cleaned
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Image Extraction (Fix #8: canvas capture, Fix #14/#15: handled at download) ---

function extractImages(maxImages = 30) {
  const images = [];
  const seen = new Set();
  const minSize = 100;
  const limit = maxImages || 30;

  // Regular images
  document.querySelectorAll('img').forEach(img => {
    const src = img.src || img.dataset.src || img.dataset.lazySrc;
    if (!src || seen.has(src)) return;
    if (src.startsWith('data:')) return;

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (width && width < minSize && height && height < minSize) return;

    seen.add(src);
    images.push(src);
  });

  // Fix #8: Try to capture canvas elements as images
  document.querySelectorAll('canvas').forEach(canvas => {
    try {
      if (canvas.width > 100 && canvas.height > 100) {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl && dataUrl.length > 100) {
          images.push(dataUrl);
        }
      }
    } catch (e) {
      // Canvas is tainted (CORS) — can't export
    }
  });

  // Fix #6: Note accessible iframes
  document.querySelectorAll('iframe').forEach(iframe => {
    try {
      const iframeDoc = iframe.contentDocument;
      if (iframeDoc) {
        iframeDoc.querySelectorAll('img').forEach(img => {
          if (img.src && !seen.has(img.src) && !img.src.startsWith('data:')) {
            seen.add(img.src);
            images.push(img.src);
          }
        });
      }
    } catch (e) {
      // Cross-origin iframe — can't access
    }
  });

  return images.slice(0, limit);
}
