# Testing — Inst-AI-nt Snap

## Running Tests

```bash
npm test              # all tests
npm run test:unit     # unit tests only
npm run test:properties  # property-based tests only
```

## Structure

```
tests/
  test-helpers.js         — Chrome API mocks, test key generator
  unit/
    license.test.js       — license activation, usage tracking, feature gating
    citations.test.js     — citation formatting for specific inputs
  properties/
    license-keys.property.js  — key format/checksum invariants
    citations.property.js     — citation generation invariants
```

## Approach

Property-based testing with `fast-check` is the primary strategy. We generate random valid inputs and assert that invariants hold across all of them. Unit tests supplement where exact behavior needs pinning down.

No DOM testing. We test logic — extraction heuristics, formatting, gating decisions — not UI rendering.

## Mocking

All modules accept a `deps` parameter for dependency injection. In tests, we inject mocks from `test-helpers.js`:

```javascript
import { createMockChromeStorage, createLicenseDeps } from '../test-helpers.js';

const deps = createLicenseDeps();
const result = await canClip(deps);
```

Available mocks:
- `createMockChromeStorage()` — in-memory key/value store
- `createMockCrypto()` — deterministic randomUUID and getRandomValues
- `createMockFetch(response)` — returns configured response, tracks calls
- `createLicenseDeps(overrides)` — full deps bundle for license module
- `generateTestKey(crypto)` — produces valid SNAP-XXXX keys for testing

## Writing a New Property Test

```javascript
import { describe, it } from 'node:test';
import fc from 'fast-check';
import assert from 'node:assert/strict';

describe('Feature: X, Property N: description', () => {
  it('invariant statement as a sentence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (input) => {
          const result = await functionUnderTest(input, mockDeps);
          assert.ok(result.someProperty);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

## What's Covered

| Module | Coverage | Notes |
|--------|----------|-------|
| license.js | Good | Key validation, usage gating, daily reset |
| citations.js | Good | All 4 formats, edge cases |
| content.js extraction | None | Needs DOM — hard to unit test |
| background.js prompt builder | None | Good candidate for property tests |
| background.js search | None | Good candidate for unit tests |

## What's Not Tested (and Why)

- **DOM extraction** (content.js) — requires a real browser context. The readability scorer, paywall detector, and structured extractors all touch `document`. Testing these properly would need a headless browser, which adds weight we don't want.
- **UI wiring** (popup.js, dashboard.js, options.js) — pure DOM event binding. If it works when you click it, it works.
- **Chrome downloads API integration** — can't meaningfully mock file system writes.
