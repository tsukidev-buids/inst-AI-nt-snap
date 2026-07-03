import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load citations.js
const __dirname = dirname(fileURLToPath(import.meta.url));
const citationsSource = readFileSync(resolve(__dirname, '../../citations.js'), 'utf-8');
const moduleShim = { exports: {} };
const citationsFactory = new Function('module', 'exports',
  citationsSource + '\nmodule.exports = { generateCitation, generateInTextCitation, extractYear };'
);
citationsFactory(moduleShim, moduleShim.exports);
const { generateCitation, generateInTextCitation, extractYear } = moduleShim.exports;

// Arbitrary for citation metadata
const metadataArb = fc.record({
  author: fc.oneof(fc.constant(''), fc.lorem({ maxCount: 3 }).map(s => s.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '))),
  date: fc.oneof(fc.constant(''), fc.date({ min: new Date('1900-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString().split('T')[0])),
  title: fc.oneof(fc.constant(''), fc.lorem({ maxCount: 8 }).map(s => s[0].toUpperCase() + s.slice(1))),
  siteName: fc.oneof(fc.constant(''), fc.lorem({ maxCount: 2 }).map(s => s[0].toUpperCase() + s.slice(1))),
  publisher: fc.oneof(fc.constant(''), fc.lorem({ maxCount: 2 }).map(s => s[0].toUpperCase() + s.slice(1))),
  url: fc.webUrl(),
  accessDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString().split('T')[0])
});

const styleArb = fc.constantFrom('apa', 'mla', 'harvard', 'chicago');

describe('Citation Properties', () => {
  it('generateCitation never throws for any valid metadata + style', () => {
    fc.assert(
      fc.property(metadataArb, styleArb, (meta, style) => {
        // Should not throw
        const citation = generateCitation(meta, style);
        assert.ok(typeof citation === 'string');
        assert.ok(citation.length > 0);
      }),
      { numRuns: 300 }
    );
  });

  it('generateCitation always includes the URL', () => {
    fc.assert(
      fc.property(metadataArb, styleArb, (meta, style) => {
        const citation = generateCitation(meta, style);
        // URL should be present in some form (MLA strips protocol)
        const urlDomain = new URL(meta.url).hostname;
        assert.ok(citation.includes(urlDomain),
          `Citation should include domain ${urlDomain}: ${citation}`);
      }),
      { numRuns: 200 }
    );
  });

  it('generateCitation includes author when provided', () => {
    fc.assert(
      fc.property(
        metadataArb.filter(m => m.author.length > 0),
        styleArb,
        (meta, style) => {
          const citation = generateCitation(meta, style);
          // At least part of the author name should appear
          const firstWord = meta.author.split(' ')[0];
          assert.ok(citation.includes(firstWord),
            `Citation should include author "${firstWord}": ${citation}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('generateInTextCitation never throws', () => {
    fc.assert(
      fc.property(metadataArb, styleArb, (meta, style) => {
        const inText = generateInTextCitation(meta, style);
        assert.ok(typeof inText === 'string');
        assert.ok(inText.length > 0);
        // Should be wrapped in parens
        assert.ok(inText.startsWith('('));
        assert.ok(inText.endsWith(')'));
      }),
      { numRuns: 300 }
    );
  });

  it('generateInTextCitation includes year when date is provided (except MLA)', () => {
    fc.assert(
      fc.property(
        metadataArb.filter(m => m.date.length > 0),
        fc.constantFrom('apa', 'harvard', 'chicago'),
        (meta, style) => {
          const inText = generateInTextCitation(meta, style);
          const year = new Date(meta.date).getFullYear().toString();
          assert.ok(inText.includes(year),
            `In-text citation should include year ${year}: ${inText}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('extractYear returns a 4-digit year string or n.d.', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.date({ min: new Date('1900-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
          fc.lorem({ maxCount: 3 })
        ),
        (dateStr) => {
          const year = extractYear(dateStr);
          assert.ok(
            year === 'n.d.' || /^\d{4}$/.test(year),
            `extractYear("${dateStr}") returned "${year}" — expected 4-digit year or "n.d."`
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});
