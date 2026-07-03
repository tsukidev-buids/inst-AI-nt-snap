import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import crypto from 'node:crypto';

// Load license.js
const __dirname = dirname(fileURLToPath(import.meta.url));
const licenseSource = readFileSync(resolve(__dirname, '../../license.js'), 'utf-8');
const moduleShim = { exports: {} };
const licenseFactory = new Function('module', 'exports', 'chrome', 'crypto', licenseSource + '\nmodule.exports = module.exports;');
licenseFactory(moduleShim, moduleShim.exports, { storage: { local: null } }, crypto);
const { SnapLicense } = moduleShim.exports;

describe('License Key Properties', () => {
  it('every generated key has valid format', () => {
    fc.assert(
      fc.property(fc.integer(), () => {
        const key = SnapLicense.generateLicenseKey({ crypto });
        assert.equal(SnapLicense.isValidKeyFormat(key), true,
          `Generated key ${key} failed format validation`);
      }),
      { numRuns: 200 }
    );
  });

  it('every generated key passes checksum verification', () => {
    fc.assert(
      fc.property(fc.integer(), () => {
        const key = SnapLicense.generateLicenseKey({ crypto });
        assert.equal(SnapLicense.verifyKeyChecksum(key), true,
          `Generated key ${key} failed checksum verification`);
      }),
      { numRuns: 200 }
    );
  });

  it('modifying any character in the payload invalidates the checksum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),  // which group to modify (0-2 = groups 1-3)
        fc.integer({ min: 0, max: 3 }),  // which char in group to modify
        () => {
          const key = SnapLicense.generateLicenseKey({ crypto });
          const parts = key.split('-');

          // Grab the target group (indices 1-3 are the payload groups)
          const groupIdx = fc.sample(fc.integer({ min: 1, max: 3 }), 1)[0];
          const charIdx = fc.sample(fc.integer({ min: 0, max: 3 }), 1)[0];

          const group = parts[groupIdx];
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          const currentChar = group[charIdx];
          // Pick a different char
          let newChar = chars[(chars.indexOf(currentChar) + 1) % chars.length];

          const modifiedGroup = group.substring(0, charIdx) + newChar + group.substring(charIdx + 1);
          parts[groupIdx] = modifiedGroup;
          const tampered = parts.join('-');

          assert.equal(SnapLicense.verifyKeyChecksum(tampered), false,
            `Tampered key ${tampered} (from ${key}) should fail checksum`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('checksum is deterministic — same payload always yields same checksum', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), { minLength: 12, maxLength: 12 }),
        (payload) => {
          const a = SnapLicense.computeChecksum(payload);
          const b = SnapLicense.computeChecksum(payload);
          assert.equal(a, b);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('checksum is always exactly 4 alphanumeric characters', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), { minLength: 1, maxLength: 50 }),
        (payload) => {
          const checksum = SnapLicense.computeChecksum(payload);
          assert.equal(checksum.length, 4);
          assert.match(checksum, /^[A-Z0-9]{4}$/);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('generated keys are unique (no collisions in batch)', () => {
    const keys = new Set();
    for (let i = 0; i < 500; i++) {
      keys.add(SnapLicense.generateLicenseKey({ crypto }));
    }
    assert.equal(keys.size, 500, 'Expected 500 unique keys');
  });

  it('format validation rejects arbitrary strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        (s) => {
          // Random strings should almost never match the exact SNAP-XXXX-XXXX-XXXX-XXXX pattern
          if (/^SNAP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(s)) {
            // Rare case where random string happens to match — skip
            return;
          }
          assert.equal(SnapLicense.isValidKeyFormat(s), false);
        }
      ),
      { numRuns: 500 }
    );
  });
});
