import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load citations.js
const __dirname = dirname(fileURLToPath(import.meta.url));
const citationsSource = readFileSync(resolve(__dirname, '../../citations.js'), 'utf-8');
const moduleShim = { exports: {} };

// Mock window/document for extractCitationMetadata (won't test that one directly)
const citationsFactory = new Function('module', 'exports',
  citationsSource + '\nmodule.exports = { generateCitation, generateInTextCitation, extractYear };'
);
citationsFactory(moduleShim, moduleShim.exports);
const { generateCitation, generateInTextCitation, extractYear } = moduleShim.exports;

const baseMeta = {
  author: 'Jane Smith',
  date: '2025-03-15',
  title: 'Understanding Modern Web Extensions',
  siteName: 'Dev Weekly',
  publisher: 'Dev Media Inc',
  url: 'https://devweekly.com/articles/web-extensions',
  accessDate: '2026-07-03'
};

describe('Citations Module', () => {
  describe('generateCitation() — APA', () => {
    it('includes author, date, title, site, and URL', () => {
      const citation = generateCitation(baseMeta, 'apa');
      assert.ok(citation.includes('Jane Smith'));
      assert.ok(citation.includes('2025'));
      assert.ok(citation.includes('Understanding Modern Web Extensions'));
      assert.ok(citation.includes('*Dev Weekly*'));
      assert.ok(citation.includes('https://devweekly.com'));
    });

    it('handles missing author gracefully', () => {
      const meta = { ...baseMeta, author: '' };
      const citation = generateCitation(meta, 'apa');
      assert.ok(citation.includes('[No author]'));
    });

    it('handles missing date with n.d.', () => {
      const meta = { ...baseMeta, date: '' };
      const citation = generateCitation(meta, 'apa');
      assert.ok(citation.includes('(n.d.)'));
    });

    it('handles missing site name', () => {
      const meta = { ...baseMeta, siteName: '', publisher: '' };
      const citation = generateCitation(meta, 'apa');
      // Should still produce a valid citation without site
      assert.ok(citation.includes('Jane Smith'));
      assert.ok(citation.includes('https://'));
    });

    it('defaults to APA when no style specified', () => {
      const apa = generateCitation(baseMeta, 'apa');
      const defaultStyle = generateCitation(baseMeta);
      assert.equal(apa, defaultStyle);
    });

    it('defaults to APA for unknown style', () => {
      const apa = generateCitation(baseMeta, 'apa');
      const unknown = generateCitation(baseMeta, 'unknown-style');
      assert.equal(apa, unknown);
    });
  });

  describe('generateCitation() — MLA', () => {
    it('includes author, quoted title, italicized site name', () => {
      const citation = generateCitation(baseMeta, 'mla');
      assert.ok(citation.includes('Jane Smith'));
      assert.ok(citation.includes('"Understanding Modern Web Extensions."'));
      assert.ok(citation.includes('*Dev Weekly*'));
    });

    it('includes URL without protocol', () => {
      const citation = generateCitation(baseMeta, 'mla');
      assert.ok(citation.includes('devweekly.com'));
      // MLA strips the protocol
      assert.ok(!citation.includes('https://devweekly.com'));
    });

    it('includes Accessed date', () => {
      const citation = generateCitation(baseMeta, 'mla');
      assert.ok(citation.includes('Accessed'));
    });
  });

  describe('generateCitation() — Harvard', () => {
    it('includes author, year in parens, and Available at', () => {
      const citation = generateCitation(baseMeta, 'harvard');
      assert.ok(citation.includes('Jane Smith'));
      assert.ok(citation.includes('(2025)'));
      assert.ok(citation.includes('Available at:'));
    });

    it('includes bracketed access date', () => {
      const citation = generateCitation(baseMeta, 'harvard');
      assert.ok(citation.includes('[Accessed'));
    });

    it('handles missing date with n.d.', () => {
      const meta = { ...baseMeta, date: '' };
      const citation = generateCitation(meta, 'harvard');
      assert.ok(citation.includes('(n.d.)'));
    });
  });

  describe('generateCitation() — Chicago', () => {
    it('includes author with period, quoted title', () => {
      const citation = generateCitation(baseMeta, 'chicago');
      assert.ok(citation.includes('Jane Smith.'));
      assert.ok(citation.includes('"Understanding Modern Web Extensions."'));
    });

    it('includes italicized site name', () => {
      const citation = generateCitation(baseMeta, 'chicago');
      assert.ok(citation.includes('*Dev Weekly*'));
    });

    it('includes Accessed date', () => {
      const citation = generateCitation(baseMeta, 'chicago');
      assert.ok(citation.includes('Accessed'));
    });
  });

  describe('generateInTextCitation()', () => {
    it('APA uses (Surname, Year) format', () => {
      const inText = generateInTextCitation(baseMeta, 'apa');
      assert.equal(inText, '(Smith, 2025)');
    });

    it('MLA uses (Surname) format', () => {
      const inText = generateInTextCitation(baseMeta, 'mla');
      assert.equal(inText, '(Smith)');
    });

    it('Harvard uses (Surname, Year) format', () => {
      const inText = generateInTextCitation(baseMeta, 'harvard');
      assert.equal(inText, '(Smith, 2025)');
    });

    it('Chicago uses (Surname Year) format — no comma', () => {
      const inText = generateInTextCitation(baseMeta, 'chicago');
      assert.equal(inText, '(Smith 2025)');
    });

    it('handles missing author', () => {
      const meta = { ...baseMeta, author: '' };
      const inText = generateInTextCitation(meta, 'apa');
      assert.ok(inText.includes('[No author]'));
    });

    it('handles missing date with n.d.', () => {
      const meta = { ...baseMeta, date: '' };
      const inText = generateInTextCitation(meta, 'apa');
      assert.ok(inText.includes('n.d.'));
    });

    it('uses last word of author name as surname', () => {
      const meta = { ...baseMeta, author: 'Dr. Martin Luther King Jr' };
      const inText = generateInTextCitation(meta, 'apa');
      assert.ok(inText.includes('Jr'));
    });
  });

  describe('extractYear()', () => {
    it('extracts year from ISO date', () => {
      assert.equal(extractYear('2025-03-15'), '2025');
    });

    it('extracts year from full datetime', () => {
      assert.equal(extractYear('2024-12-01T10:30:00Z'), '2024');
    });

    it('extracts year from plain year string', () => {
      assert.equal(extractYear('2023'), '2023');
    });

    it('returns n.d. for empty string', () => {
      assert.equal(extractYear(''), 'n.d.');
    });

    it('extracts year from messy string with 4-digit number', () => {
      assert.equal(extractYear('Published on 2022 by someone'), '2022');
    });
  });
});
