# Changelog

## 1.2.0 — 2026-07-07

- Keyboard shortcut: Ctrl+Shift+S to snap the current page without opening the popup
- Import from backup: restore clips from a previously exported JSON file (Settings > Data)
- Max images setting now actually works — controls how many images get saved per clip across all capture methods
- Auto-capture stops automatically when the browser restarts (no more orphaned captures running forever)
- Summarize button disabled during AI call — prevents double-clicks burning through API credits
- Storage write error handling — graceful message if chrome.storage.local fails
- Auto-capture status indicator in the popup (shows "auto-shutter on" when active)
- Extension update handler — cleanly stops auto-capture before applying updates
- Removed dead `includeMetadata` setting (metadata is always included, it's core to citations)
- Removed orphaned `regenerateCitations` function
- Removed dead `extractCitationMetadata` from citations.js (content script has its own)
- Fixed tooltip wrapping in dashboard sidebar (was rendering one word per line)
- Gemini default model updated to `gemini-2.0-flash-lite` (previous default was deprecated)
- Privacy policy now included in release zip for store submissions
- Added CHANGELOG.md and TESTING.md
- Updated README with full feature documentation, both store links, and keyboard shortcuts
- Synced package.json version with manifest
- .gitignore now excludes release zips and temp build folders
- Now live on both Chrome Web Store and Edge Add-ons

## 1.1.0 — 2026-07-03

- Added Research Desk: organize clips into projects, tag quotes, generate bibliographies
- Citation system: auto-generates APA, MLA, Harvard, and Chicago citations from page metadata
- Prompt Lab: build multi-source AI prompts with preset instructions (compare, summarize, outline, etc.)
- Session Burst (Pro): capture all open tabs in one click
- Auto-Shutter (Pro): automatically capture pages based on domain and time-on-page rules
- Deep Capture (Pro): scrolls infinite-scroll pages before capturing to grab all loaded content
- Keyboard shortcut support (Ctrl+Shift+S to snap)
- Bulk select mode in the darkroom — send multiple clips to a project or delete in batch
- Added Google Gemini as a third AI provider option
- First-visit tutorial system across popup, dashboard, and options pages
- Lazy-load detection with user warning before partial captures
- Better paywall detection with inline warnings
- PDF detection — saves the URL when a PDF can't be extracted
- Improved text extraction: readability scoring, shadow DOM piercing, anti-copy fallbacks
- Wikipedia noise removal in prompt builder output
- Storage usage indicator in the darkroom header

## 1.0.0 — 2026-06-15

- Initial release on Microsoft Edge Add-ons
- One-click page capture with text and image extraction
- Selection capture via context menu and popup button
- Local-only storage — no accounts, no servers
- AI summarization with OpenAI or Anthropic API keys (Pro)
- Markdown export with images
- Auto-download on capture (Pro)
- Full-text search across all clips
- Freemium model: 5 clips/day free, Pro unlocks unlimited
- Ko-fi license key activation (SNAP-XXXX format)
- Welcome page on first install
