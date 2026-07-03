// Inst-AI-nt Snap - License Management
// Handles freemium gating (5 clips/day free) and Ko-fi license key validation

const FREE_DAILY_CLIPS = 5;
const FREE_DAILY_PROMPTS = 1;
const FREE_DAILY_BIBLIOGRAPHIES = 1;

// Ko-fi shop URL for Pro purchase
const CHECKOUT_URL = 'https://ko-fi.com/s/97e8a39559';

// --- Default dependencies (chrome APIs) ---

function getDefaultDeps() {
  return {
    storage: chrome.storage.local,
    fetch: globalThis.fetch.bind(globalThis),
    crypto: globalThis.crypto
  };
}

// --- License Status ---

async function getLicenseStatus(deps) {
  const { storage } = deps || getDefaultDeps();
  const data = await storage.get('license');
  return data.license || { isPro: false, key: null, validatedAt: null };
}

async function saveLicenseStatus(license, deps) {
  const { storage } = deps || getDefaultDeps();
  await storage.set({ license });
}

// --- Daily Usage Tracking ---

async function getUsageToday(deps) {
  const { storage } = deps || getDefaultDeps();
  const data = await storage.get('dailyUsage');
  const dailyUsage = data.dailyUsage || {};
  const today = new Date().toDateString();

  // Reset if it's a new day
  if (dailyUsage.date !== today) {
    const fresh = { date: today, clips: 0, prompts: 0, sessions: 0, bibliographies: 0 };
    await storage.set({ dailyUsage: fresh });
    return fresh;
  }

  return dailyUsage;
}

async function incrementUsage(type, deps) {
  const { storage } = deps || getDefaultDeps();
  const usage = await getUsageToday(deps);
  usage[type] = (usage[type] || 0) + 1;
  await storage.set({ dailyUsage: usage });
  return usage;
}

// --- Feature Gating ---

async function canClip(deps) {
  const license = await getLicenseStatus(deps);
  if (license.isPro) return { allowed: true };

  const usage = await getUsageToday(deps);
  if (usage.clips >= FREE_DAILY_CLIPS) {
    return {
      allowed: false,
      reason: `Daily limit reached (${FREE_DAILY_CLIPS} clips/day). Upgrade to Pro for unlimited clips.`,
      usage: usage.clips,
      limit: FREE_DAILY_CLIPS
    };
  }
  return { allowed: true, remaining: FREE_DAILY_CLIPS - usage.clips };
}

async function canBuildPrompt(deps) {
  const license = await getLicenseStatus(deps);
  if (license.isPro) return { allowed: true };

  const usage = await getUsageToday(deps);
  if (usage.prompts >= FREE_DAILY_PROMPTS) {
    return {
      allowed: false,
      reason: `Free tier allows ${FREE_DAILY_PROMPTS} prompt build per day. Upgrade for unlimited.`,
      usage: usage.prompts,
      limit: FREE_DAILY_PROMPTS
    };
  }
  return { allowed: true, remaining: FREE_DAILY_PROMPTS - usage.prompts };
}

async function canCaptureSession(deps) {
  const license = await getLicenseStatus(deps);
  if (!license.isPro) {
    return { allowed: false, reason: 'Session capture is a Pro feature. Upgrade to enable it.' };
  }
  return { allowed: true };
}

async function canExportBibliography(deps) {
  const license = await getLicenseStatus(deps);
  if (license.isPro) return { allowed: true };

  const usage = await getUsageToday(deps);
  if ((usage.bibliographies || 0) >= FREE_DAILY_BIBLIOGRAPHIES) {
    return {
      allowed: false,
      reason: `Free tier allows ${FREE_DAILY_BIBLIOGRAPHIES} bibliography export per day. Upgrade for unlimited.`,
      usage: usage.bibliographies,
      limit: FREE_DAILY_BIBLIOGRAPHIES
    };
  }
  return { allowed: true, remaining: FREE_DAILY_BIBLIOGRAPHIES - (usage.bibliographies || 0) };
}

async function canUseAutoCapture(deps) {
  const license = await getLicenseStatus(deps);
  if (!license.isPro) {
    return { allowed: false, reason: 'Auto capture is a Pro feature. Upgrade to enable it.' };
  }
  return { allowed: true };
}

async function canUseDeepCapture(deps) {
  const license = await getLicenseStatus(deps);
  if (!license.isPro) {
    return { allowed: false, reason: 'Deep capture is a Pro feature. Upgrade to enable it.' };
  }
  return { allowed: true };
}

async function canUseAutoDownload(deps) {
  const license = await getLicenseStatus(deps);
  if (!license.isPro) {
    return { allowed: false, reason: 'Auto-download on capture is a Pro feature.' };
  }
  return { allowed: true };
}

async function canSummarize(deps) {
  const license = await getLicenseStatus(deps);
  if (!license.isPro) {
    return { allowed: false, reason: 'AI summarization is a Pro feature. Upgrade to enable it.' };
  }
  return { allowed: true };
}

// --- License Key Validation ---
// Keys are delivered via Ko-fi digital product download.
// Format: SNAP-XXXX-XXXX-XXXX-XXXX (validated locally with checksum)

function isValidKeyFormat(key) {
  return /^SNAP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

function verifyKeyChecksum(key) {
  // Last 4 chars are a checksum of the first 3 groups
  const parts = key.split('-');
  if (parts.length !== 5) return false;

  const payload = parts.slice(1, 4).join('');
  const checksum = parts[4];
  const computed = computeChecksum(payload);
  return computed === checksum;
}

function computeChecksum(payload) {
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to 4-char alphanumeric
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  let n = Math.abs(hash);
  for (let i = 0; i < 4; i++) {
    result += chars[n % chars.length];
    n = Math.floor(n / chars.length);
  }
  return result;
}

async function activateLicenseKey(key, deps) {
  const { storage } = deps || getDefaultDeps();

  const trimmed = key.trim().toUpperCase();

  if (!isValidKeyFormat(trimmed)) {
    return { success: false, message: 'Invalid key format. Should look like: SNAP-XXXX-XXXX-XXXX-XXXX' };
  }

  if (!verifyKeyChecksum(trimmed)) {
    return { success: false, message: 'Invalid license key. Double-check the key from your Ko-fi download.' };
  }

  const license = {
    isPro: true,
    key: trimmed,
    validatedAt: Date.now()
  };
  await storage.set({ license });
  return { success: true, message: '🎉 Pro activated! Enjoy unlimited features.' };
}

async function deactivateLicense(deps) {
  const { storage } = deps || getDefaultDeps();
  await storage.set({ license: { isPro: false, key: null, validatedAt: null } });
}

// Periodic validity check (called by alarm handler)
// With Ko-fi local keys, this just refreshes the validatedAt timestamp
async function checkLicenseValidity(deps) {
  const { storage } = deps || getDefaultDeps();
  const license = await getLicenseStatus(deps);
  if (!license.isPro || !license.key) return;

  // Re-verify the key checksum is still valid
  if (!verifyKeyChecksum(license.key)) {
    await storage.set({ license: { isPro: false, key: null, validatedAt: null } });
    return;
  }

  // Refresh timestamp
  license.validatedAt = Date.now();
  await storage.set({ license });
}

// --- Helpers ---

async function getInstanceId(deps) {
  const { storage, crypto: cryptoImpl } = deps || getDefaultDeps();
  const data = await storage.get('instanceId');
  if (data.instanceId) return data.instanceId;

  const id = cryptoImpl.randomUUID();
  await storage.set({ instanceId: id });
  return id;
}

// --- Key Generation (utility — for generating keys to distribute via Ko-fi) ---

function generateLicenseKey(deps) {
  const { crypto: cryptoImpl } = deps || getDefaultDeps();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomGroup = () => {
    let group = '';
    const bytes = new Uint8Array(4);
    cryptoImpl.getRandomValues(bytes);
    for (let i = 0; i < 4; i++) {
      group += chars[bytes[i] % chars.length];
    }
    return group;
  };

  const g1 = randomGroup();
  const g2 = randomGroup();
  const g3 = randomGroup();
  const payload = g1 + g2 + g3;
  const checksum = computeChecksum(payload);

  return `SNAP-${g1}-${g2}-${g3}-${checksum}`;
}

// --- Exports for testing (CJS-compatible) ---

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SnapLicense: {
      FREE_DAILY_CLIPS,
      FREE_DAILY_PROMPTS,
      FREE_DAILY_BIBLIOGRAPHIES,
      CHECKOUT_URL,
      getLicenseStatus,
      saveLicenseStatus,
      getUsageToday,
      incrementUsage,
      canClip,
      canBuildPrompt,
      canCaptureSession,
      canExportBibliography,
      canUseAutoCapture,
      canUseDeepCapture,
      canUseAutoDownload,
      canSummarize,
      isValidKeyFormat,
      verifyKeyChecksum,
      computeChecksum,
      activateLicenseKey,
      deactivateLicense,
      checkLicenseValidity,
      getInstanceId,
      generateLicenseKey
    }
  };
}
