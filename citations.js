// Inst-AI-nt Snap — Citation Generator
// Parses page metadata and generates formatted citations

// Generate citation from page metadata
function generateCitation(metadata, style = 'apa') {
  const { author, date, title, siteName, url, publisher, accessDate } = metadata;

  const accessed = accessDate || new Date().toISOString().split('T')[0];

  switch (style) {
    case 'apa': return formatAPA(author, date, title, siteName, publisher, url, accessed);
    case 'mla': return formatMLA(author, title, siteName, publisher, date, url, accessed);
    case 'harvard': return formatHarvard(author, date, title, siteName, url, accessed);
    case 'chicago': return formatChicago(author, title, siteName, date, url, accessed);
    default: return formatAPA(author, date, title, siteName, publisher, url, accessed);
  }
}

// APA 7th Edition
function formatAPA(author, date, title, siteName, publisher, url, accessed) {
  const authorStr = author || '[No author]';
  const dateStr = date ? formatAPADate(date) : '(n.d.)';
  const titleStr = title || '[No title]';
  const sourceStr = siteName || publisher || '';

  let citation = `${authorStr}. ${dateStr}. ${titleStr}.`;
  if (sourceStr) citation += ` *${sourceStr}*.`;
  citation += ` ${url}`;

  return citation;
}

function formatAPADate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return `(${dateStr})`;
    const year = d.getFullYear();
    const month = d.toLocaleString('en', { month: 'long' });
    const day = d.getDate();
    return `(${year}, ${month} ${day})`;
  } catch (e) {
    return `(${dateStr})`;
  }
}

// MLA 9th Edition
function formatMLA(author, title, siteName, publisher, date, url, accessed) {
  const authorStr = author || '';
  const titleStr = title ? `"${title}."` : '';
  const siteStr = siteName ? `*${siteName}*,` : '';
  const pubStr = publisher && publisher !== siteName ? `${publisher},` : '';
  const dateStr = date ? formatMLADate(date) + ',' : '';
  const urlStr = url.replace(/^https?:\/\//, '');
  const accessStr = `Accessed ${formatMLADate(accessed)}.`;

  let parts = [authorStr, titleStr, siteStr, pubStr, dateStr, urlStr + '.', accessStr].filter(Boolean);
  return parts.join(' ');
}

function formatMLADate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const day = d.getDate();
    const month = d.toLocaleString('en', { month: 'short' }).replace('.', '');
    const year = d.getFullYear();
    return `${day} ${month}. ${year}`;
  } catch (e) {
    return dateStr;
  }
}

// Harvard
function formatHarvard(author, date, title, siteName, url, accessed) {
  const authorStr = author || '[No author]';
  const year = date ? extractYear(date) : 'n.d.';
  const titleStr = title || '[No title]';
  const sourceStr = siteName ? `*${siteName}*.` : '';
  const accessStr = `[Accessed ${formatHarvardDate(accessed)}]`;

  return `${authorStr} (${year}). ${titleStr}. ${sourceStr} Available at: ${url} ${accessStr}.`;
}

function formatHarvardDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${d.getDate()} ${d.toLocaleString('en', { month: 'long' })} ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

// Chicago (Notes-Bibliography)
function formatChicago(author, title, siteName, date, url, accessed) {
  const authorStr = author || '';
  const titleStr = title ? `"${title}."` : '';
  const siteStr = siteName ? `*${siteName}*.` : '';
  const dateStr = date ? formatChicagoDate(date) + '.' : '';
  const accessStr = `Accessed ${formatChicagoDate(accessed)}.`;

  let parts = [authorStr ? authorStr + '.' : '', titleStr, siteStr, dateStr, url + '.', accessStr].filter(Boolean);
  return parts.join(' ');
}

function formatChicagoDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${d.toLocaleString('en', { month: 'long' })} ${d.getDate()}, ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

// Generate in-text citation
function generateInTextCitation(metadata, style = 'apa') {
  const { author, date } = metadata;
  const surname = author ? author.split(' ').pop() : '[No author]';
  const year = date ? extractYear(date) : 'n.d.';

  switch (style) {
    case 'apa': return `(${surname}, ${year})`;
    case 'mla': return `(${surname})`;
    case 'harvard': return `(${surname}, ${year})`;
    case 'chicago': return `(${surname} ${year})`;
    default: return `(${surname}, ${year})`;
  }
}

// Helper
function extractYear(dateStr) {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d)) return d.getFullYear().toString();
    const match = dateStr.match(/\d{4}/);
    return match ? match[0] : 'n.d.';
  } catch (e) {
    return 'n.d.';
  }
}

// Parse metadata from page (to be called in content script context)
function extractCitationMetadata() {
  const getMeta = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const content = el.getAttribute('content') || el.textContent;
        if (content && content.trim()) return content.trim();
      }
    }
    return '';
  };

  return {
    author: getMeta([
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="dcterms.creator"]',
      'meta[name="dc.creator"]',
      '[rel="author"]',
      '[itemprop="author"] [itemprop="name"]',
      '[itemprop="author"]',
      '.author-name',
      '.byline'
    ]),
    date: getMeta([
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="dcterms.date"]',
      'meta[name="dc.date"]',
      'meta[property="og:updated_time"]',
      'time[datetime]',
      '[itemprop="datePublished"]'
    ]) || (document.querySelector('time[datetime]') ? document.querySelector('time[datetime]').getAttribute('datetime') : ''),
    title: document.title.replace(/\s*[-|–—]\s*[^-|–—]*$/, '').trim(),
    siteName: getMeta([
      'meta[property="og:site_name"]',
      'meta[name="application-name"]'
    ]),
    publisher: getMeta([
      'meta[property="article:publisher"]',
      'meta[name="publisher"]',
      '[itemprop="publisher"] [itemprop="name"]'
    ]),
    url: window.location.href,
    accessDate: new Date().toISOString().split('T')[0]
  };
}
