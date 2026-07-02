// Inst-AI-nt Snap - License Management
// Handles freemium gating (5 clips/day free) and LemonSqueezy license validation

const FREE_DAILY_CLIPS = 5;
const FREE_DAILY_PROMPTS = 1;

// Replace with your actual LemonSqueezy checkout URL after creating a product
const CHECKOUT_URL = 'https://tsukidev.lemonsqueezy.com/buy/instant-snap-pro';

// --- License Status ---

async function getLicenseStatus() {
  const data = await chrome.storage.local.get('license');
  return data.license || { isPro: false, key: null, validatedAt: null };
}

async function saveLicenseStatus(license) {
  await chrome.storage.local.set({ license });
}

// --- Daily Usage Tracking ---

async function getUsageToday() {
  const { dailyUsage = {} } = await chrome.storage.local.get('dailyUsage');
  const today = new Date().toDateString();

  // Reset if it's a new day
  if (dailyUsage.date !== today) {
    const fresh = { date: today, clips: 0, prompts: 0, sessions: 0, bibliographies: 0 };
    await chrome.storage.local.set({ dailyUsage: fresh });
    return fresh;
  }

  return dailyUsage;
}

async function incrementUsage(type) {
  const usage = await getUsageToday();
  usage[type] = (usage[type] || 0) + 1;
  await chrome.storage.local.set({ dailyUsage: usage });
  return usage;
}

// --- Feature Gating ---

async function canClip() {
  const license = await getLicenseStatus();
  if (license.isPro) return { allowed: true };

  const usage = await getUsageToday();
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

async function canBuildPrompt() {
  const license = await getLicenseStatus();
  if (license.isPro) return { allowed: true };

  const usage = await getUsageToday();
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

async function canCaptureSession() {
  const license = await getLicenseStatus();
  if (!license.isPro) {
    return { allowed: false, reason: 'Session capture is a Pro feature. Upgrade to enable it.' };
  }
  return { allowed: true };
}

const FREE_DAILY_BIBLIOGRAPHIES = 1;

async function canExportBibliography() {
  const license = await getLicenseStatus();
  if (license.isPro) return { allowed: true };

  const usage = await getUsageToday();
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

async function canUseAutoCapture() {
  const license = await getLicenseStatus();
  if (!license.isPro) {
    return { allowed: false, reason: 'Auto capture is a Pro feature. Upgrade to enable it.' };
  }
  return { allowed: true };
}

async function canUseDeepCapture() {
  const license = await getLicenseStatus();
  if (!license.isPro) {
    return { allowed: false, reason: 'Deep capture is a Pro feature. Upgrade to enable it.' };
  }
  return { allowed: true };
}

async function canUseAutoDownload() {
  const license = await getLicenseStatus();
  if (!license.isPro) {
    return { allowed: false, reason: 'Auto-download on capture is a Pro feature.' };
  }
  return { allowed: true };
}

async function canSummarize() {
  const license = await getLicenseStatus();
  if (!license.isPro) {
    return { allowed: false, reason: 'AI summarization is a Pro feature. Upgrade to enable it.' };
  }
  return { allowed: true };
}

// --- License Validation ---

async function activateLicenseKey(key) {
  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        license_key: key,
        instance_name: 'InstantSnap - ' + (await getInstanceId())
      })
    });

    const result = await response.json();

    if (result.activated || result.valid) {
      const license = {
        isPro: true,
        key: key,
        instanceId: result.instance?.id || null,
        validatedAt: Date.now()
      };
      await saveLicenseStatus(license);
      return { success: true, message: '🎉 Pro activated! Enjoy unlimited features.' };
    } else {
      return { success: false, message: result.error || 'Activation failed. Key may have reached its device limit.' };
    }
  } catch (err) {
    return { success: false, message: 'Network error. Please try again.' };
  }
}

async function validateLicenseKey(key) {
  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        license_key: key,
        instance_name: 'InstantSnap'
      })
    });

    const result = await response.json();

    if (result.valid) {
      const license = {
        isPro: true,
        key: key,
        validatedAt: Date.now()
      };
      await saveLicenseStatus(license);
      return { success: true };
    } else {
      return { success: false };
    }
  } catch (err) {
    // Offline — grace period
    const existing = await getLicenseStatus();
    if (existing.isPro && existing.key === key) {
      return { success: true };
    }
    return { success: false };
  }
}

async function deactivateLicense() {
  const license = await getLicenseStatus();
  if (license.key && license.instanceId) {
    try {
      await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          license_key: license.key,
          instance_id: license.instanceId
        })
      });
    } catch (e) {}
  }
  await saveLicenseStatus({ isPro: false, key: null, validatedAt: null });
}

// Periodic re-validation (weekly, with 30-day grace)
async function checkLicenseValidity() {
  const license = await getLicenseStatus();
  if (!license.isPro || !license.key) return;

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - license.validatedAt < weekMs) return; // Still fresh

  const result = await validateLicenseKey(license.key);
  if (!result.success) {
    // Grace period — 30 days
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - license.validatedAt > thirtyDays) {
      await saveLicenseStatus({ isPro: false, key: null, validatedAt: null });
    }
  }
}

// --- Helpers ---

async function getInstanceId() {
  const data = await chrome.storage.local.get('instanceId');
  if (data.instanceId) return data.instanceId;

  const id = crypto.randomUUID();
  await chrome.storage.local.set({ instanceId: id });
  return id;
}
