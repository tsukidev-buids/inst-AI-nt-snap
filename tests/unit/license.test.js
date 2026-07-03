import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockChromeStorage, createMockCrypto, createLicenseDeps } from '../test-helpers.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import crypto from 'node:crypto';

// Load license.js with shims
const __dirname = dirname(fileURLToPath(import.meta.url));
const licenseSource = readFileSync(resolve(__dirname, '../../license.js'), 'utf-8');
const moduleShim = { exports: {} };
const licenseFactory = new Function('module', 'exports', 'chrome', 'crypto', licenseSource + '\nmodule.exports = module.exports;');
licenseFactory(moduleShim, moduleShim.exports, { storage: { local: null } }, crypto);
const { SnapLicense } = moduleShim.exports;

describe('License Module', () => {
  let deps;

  beforeEach(() => {
    deps = createLicenseDeps();
  });

  describe('getLicenseStatus()', () => {
    it('returns default free status when no license stored', async () => {
      const status = await SnapLicense.getLicenseStatus(deps);
      assert.deepEqual(status, { isPro: false, key: null, validatedAt: null });
    });

    it('returns stored license when present', async () => {
      const license = { isPro: true, key: 'SNAP-TEST-TEST-TEST-ABCD', validatedAt: 1000 };
      await deps.storage.set({ license });

      const status = await SnapLicense.getLicenseStatus(deps);
      assert.deepEqual(status, license);
    });
  });

  describe('isValidKeyFormat()', () => {
    it('accepts valid key format', () => {
      assert.equal(SnapLicense.isValidKeyFormat('SNAP-ABCD-EF12-GH34-IJ56'), true);
    });

    it('rejects keys without SNAP prefix', () => {
      assert.equal(SnapLicense.isValidKeyFormat('XXXX-ABCD-EF12-GH34-IJ56'), false);
    });

    it('rejects keys with wrong length groups', () => {
      assert.equal(SnapLicense.isValidKeyFormat('SNAP-ABC-EF12-GH34-IJ56'), false);
    });

    it('rejects keys with lowercase', () => {
      assert.equal(SnapLicense.isValidKeyFormat('SNAP-abcd-EF12-GH34-IJ56'), false);
    });

    it('rejects keys with special characters', () => {
      assert.equal(SnapLicense.isValidKeyFormat('SNAP-AB!D-EF12-GH34-IJ56'), false);
    });

    it('rejects empty string', () => {
      assert.equal(SnapLicense.isValidKeyFormat(''), false);
    });
  });

  describe('computeChecksum() and verifyKeyChecksum()', () => {
    it('computes a 4-character checksum', () => {
      const checksum = SnapLicense.computeChecksum('ABCDEFGHIJKL');
      assert.equal(checksum.length, 4);
      assert.match(checksum, /^[A-Z0-9]{4}$/);
    });

    it('same payload produces same checksum', () => {
      const a = SnapLicense.computeChecksum('HELLO123WORLD');
      const b = SnapLicense.computeChecksum('HELLO123WORLD');
      assert.equal(a, b);
    });

    it('different payloads produce different checksums', () => {
      const a = SnapLicense.computeChecksum('AAAAAAAAAAAA');
      const b = SnapLicense.computeChecksum('BBBBBBBBBBBB');
      assert.notEqual(a, b);
    });

    it('verifyKeyChecksum returns true for correctly checksummed key', () => {
      const key = SnapLicense.generateLicenseKey({ crypto });
      assert.equal(SnapLicense.verifyKeyChecksum(key), true);
    });

    it('verifyKeyChecksum returns false for tampered key', () => {
      const key = SnapLicense.generateLicenseKey({ crypto });
      // Flip the last character of the checksum
      const parts = key.split('-');
      parts[4] = 'ZZZZ';
      const tampered = parts.join('-');
      assert.equal(SnapLicense.verifyKeyChecksum(tampered), false);
    });

    it('verifyKeyChecksum returns false for wrong number of parts', () => {
      assert.equal(SnapLicense.verifyKeyChecksum('SNAP-ABCD-EFGH'), false);
    });
  });

  describe('generateLicenseKey()', () => {
    it('generates a key in valid format', () => {
      const key = SnapLicense.generateLicenseKey({ crypto });
      assert.equal(SnapLicense.isValidKeyFormat(key), true);
    });

    it('generates a key that passes checksum verification', () => {
      const key = SnapLicense.generateLicenseKey({ crypto });
      assert.equal(SnapLicense.verifyKeyChecksum(key), true);
    });

    it('generates unique keys', () => {
      const keys = new Set();
      for (let i = 0; i < 50; i++) {
        keys.add(SnapLicense.generateLicenseKey({ crypto }));
      }
      assert.equal(keys.size, 50);
    });
  });

  describe('activateLicenseKey()', () => {
    it('activates a valid key', async () => {
      const key = SnapLicense.generateLicenseKey({ crypto });
      const result = await SnapLicense.activateLicenseKey(key, deps);

      assert.equal(result.success, true);
      assert.ok(result.message.includes('Pro activated'));

      const saved = await deps.storage.get('license');
      assert.equal(saved.license.isPro, true);
      assert.equal(saved.license.key, key);
      assert.ok(saved.license.validatedAt > 0);
    });

    it('accepts lowercase input and normalizes to uppercase', async () => {
      const key = SnapLicense.generateLicenseKey({ crypto });
      const lower = key.toLowerCase();
      const result = await SnapLicense.activateLicenseKey(lower, deps);

      assert.equal(result.success, true);
    });

    it('trims whitespace from input', async () => {
      const key = SnapLicense.generateLicenseKey({ crypto });
      const padded = `  ${key}  `;
      const result = await SnapLicense.activateLicenseKey(padded, deps);

      assert.equal(result.success, true);
    });

    it('rejects invalid format', async () => {
      const result = await SnapLicense.activateLicenseKey('not-a-key', deps);

      assert.equal(result.success, false);
      assert.ok(result.message.includes('Invalid key format'));
    });

    it('rejects valid format but bad checksum', async () => {
      const result = await SnapLicense.activateLicenseKey('SNAP-AAAA-BBBB-CCCC-ZZZZ', deps);

      assert.equal(result.success, false);
      assert.ok(result.message.includes('Invalid license key'));
    });
  });

  describe('deactivateLicense()', () => {
    it('clears license status', async () => {
      await deps.storage.set({
        license: { isPro: true, key: 'SNAP-TEST-TEST-TEST-ABCD', validatedAt: 1000 }
      });

      await SnapLicense.deactivateLicense(deps);

      const saved = await deps.storage.get('license');
      assert.equal(saved.license.isPro, false);
      assert.equal(saved.license.key, null);
    });
  });

  describe('Daily Usage Tracking', () => {
    it('returns fresh usage for a new day', async () => {
      const usage = await SnapLicense.getUsageToday(deps);
      assert.equal(usage.clips, 0);
      assert.equal(usage.prompts, 0);
      assert.equal(usage.sessions, 0);
      assert.equal(usage.bibliographies, 0);
      assert.equal(usage.date, new Date().toDateString());
    });

    it('returns existing usage for same day', async () => {
      const today = new Date().toDateString();
      await deps.storage.set({ dailyUsage: { date: today, clips: 3, prompts: 1, sessions: 0, bibliographies: 0 } });

      const usage = await SnapLicense.getUsageToday(deps);
      assert.equal(usage.clips, 3);
      assert.equal(usage.prompts, 1);
    });

    it('resets usage on new day', async () => {
      await deps.storage.set({ dailyUsage: { date: 'Wed Jan 01 2020', clips: 5, prompts: 1, sessions: 2, bibliographies: 1 } });

      const usage = await SnapLicense.getUsageToday(deps);
      assert.equal(usage.clips, 0);
    });

    it('incrementUsage bumps the correct type', async () => {
      await SnapLicense.getUsageToday(deps); // initialize
      const usage = await SnapLicense.incrementUsage('clips', deps);
      assert.equal(usage.clips, 1);
    });
  });

  describe('Feature Gating', () => {
    it('canClip allows pro users unlimited clips', async () => {
      await deps.storage.set({ license: { isPro: true, key: 'x', validatedAt: 1000 } });
      const result = await SnapLicense.canClip(deps);
      assert.equal(result.allowed, true);
    });

    it('canClip allows free users under limit', async () => {
      const today = new Date().toDateString();
      await deps.storage.set({ dailyUsage: { date: today, clips: 3, prompts: 0, sessions: 0, bibliographies: 0 } });

      const result = await SnapLicense.canClip(deps);
      assert.equal(result.allowed, true);
      assert.equal(result.remaining, 2);
    });

    it('canClip blocks free users at limit', async () => {
      const today = new Date().toDateString();
      await deps.storage.set({ dailyUsage: { date: today, clips: 5, prompts: 0, sessions: 0, bibliographies: 0 } });

      const result = await SnapLicense.canClip(deps);
      assert.equal(result.allowed, false);
      assert.ok(result.reason.includes('Daily limit'));
    });

    it('canBuildPrompt blocks free users after 1 use', async () => {
      const today = new Date().toDateString();
      await deps.storage.set({ dailyUsage: { date: today, clips: 0, prompts: 1, sessions: 0, bibliographies: 0 } });

      const result = await SnapLicense.canBuildPrompt(deps);
      assert.equal(result.allowed, false);
    });

    it('canCaptureSession blocks free users', async () => {
      const result = await SnapLicense.canCaptureSession(deps);
      assert.equal(result.allowed, false);
      assert.ok(result.reason.includes('Pro feature'));
    });

    it('canCaptureSession allows pro users', async () => {
      await deps.storage.set({ license: { isPro: true, key: 'x', validatedAt: 1000 } });
      const result = await SnapLicense.canCaptureSession(deps);
      assert.equal(result.allowed, true);
    });

    it('canExportBibliography blocks after 1 free use', async () => {
      const today = new Date().toDateString();
      await deps.storage.set({ dailyUsage: { date: today, clips: 0, prompts: 0, sessions: 0, bibliographies: 1 } });

      const result = await SnapLicense.canExportBibliography(deps);
      assert.equal(result.allowed, false);
    });

    it('canUseAutoCapture blocks free users', async () => {
      const result = await SnapLicense.canUseAutoCapture(deps);
      assert.equal(result.allowed, false);
    });

    it('canUseDeepCapture blocks free users', async () => {
      const result = await SnapLicense.canUseDeepCapture(deps);
      assert.equal(result.allowed, false);
    });

    it('canUseAutoDownload blocks free users', async () => {
      const result = await SnapLicense.canUseAutoDownload(deps);
      assert.equal(result.allowed, false);
    });

    it('canSummarize blocks free users', async () => {
      const result = await SnapLicense.canSummarize(deps);
      assert.equal(result.allowed, false);
    });

    it('canSummarize allows pro users', async () => {
      await deps.storage.set({ license: { isPro: true, key: 'x', validatedAt: 1000 } });
      const result = await SnapLicense.canSummarize(deps);
      assert.equal(result.allowed, true);
    });
  });

  describe('getInstanceId()', () => {
    it('creates and stores a new instance ID', async () => {
      const id = await SnapLicense.getInstanceId(deps);
      assert.ok(id);
      assert.ok(typeof id === 'string');

      const stored = await deps.storage.get('instanceId');
      assert.equal(stored.instanceId, id);
    });

    it('returns existing instance ID', async () => {
      await deps.storage.set({ instanceId: 'existing-id' });
      const id = await SnapLicense.getInstanceId(deps);
      assert.equal(id, 'existing-id');
    });
  });
});
