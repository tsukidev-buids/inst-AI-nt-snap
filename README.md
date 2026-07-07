# Inst-AI-nt Snap

Capture any web page's content instantly. Store it locally, organize it into research projects, generate citations, and export AI-ready prompts — all without leaving your browser.

## Features

**Capture**
- One-click full page capture — extracts readable text, images, and metadata
- Selection capture — highlight text and clip just that
- Deep Capture (Pro) — scrolls lazy-loading pages to grab everything
- Session Burst (Pro) — capture all open tabs at once
- Auto-Shutter (Pro) — automatically captures pages based on domain or time-on-page rules
- Structured extraction for recipes, products, code blocks, and articles

**Research**
- Research Desk — organize clips into projects
- Auto-generated citations in APA, MLA, Harvard, and Chicago formats
- Tag quotes, add notes, build bibliographies
- Full-text search across all clips

**Export**
- Prompt Lab — select clips, pick an instruction (compare, summarize, outline, etc.), and download an AI-ready markdown file
- Copy as markdown, download with images, or export your entire library as JSON
- Import from backup to restore clips

**AI (Pro)**
- One-click summarization with your own OpenAI, Anthropic, or Google Gemini API key
- Auto-download captures as markdown on save

**Privacy**
- All data stored locally in `chrome.storage.local`
- No accounts, no servers, no tracking
- API keys stored locally, only transmitted to the provider you configure

## Installation

- **Microsoft Edge:** [Install from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/instaint-snap/mcklnjgpbjfibfjjfkgolijfjadcinff)
- **Google Chrome:** [Install from Chrome Web Store](https://chromewebstore.google.com/detail/inst-ai-nt-snap/kdbjejlkkdnihimhfholbochfmmbhpml)

### Development

1. Go to `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `instant-snap` folder

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Snap the current page |

Configure in `chrome://extensions/shortcuts`.

## Architecture

```
instant-snap/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — storage, AI, export, research
├── content.js             # Content script — extraction, readability, deep scroll
├── license.js             # Freemium gating and license key validation
├── citations.js           # Citation generation (APA, MLA, Harvard, Chicago)
├── popup/                 # Popup UI (snap, library preview)
├── options/               # Settings (license, AI, capture prefs)
├── dashboard/             # Darkroom — full library, prompt lab, research desk
├── welcome/               # First-install welcome page
├── tutorial/              # Tutorial system + custom select component
├── icons/                 # Extension icons
└── tests/                 # Unit + property-based tests
```

## Testing

```bash
npm test                   # all tests
npm run test:unit          # unit tests only
npm run test:properties    # property-based tests only
```

See [TESTING.md](TESTING.md) for details on the testing approach.

## Free vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| Page capture | 5/day | Unlimited |
| Selection capture | 5/day | Unlimited |
| Prompt builder | 1/day | Unlimited |
| Bibliography export | 1/day | Unlimited |
| Research projects | 1 | Unlimited |
| Deep Capture | — | Yes |
| Session Burst | — | Yes |
| Auto-Shutter | — | Yes |
| AI Summarization | — | Yes |
| Auto-download | — | Yes |

Pro is a one-time purchase via [Ko-fi](https://ko-fi.com/s/97e8a39559). You get a license key (SNAP-XXXX-XXXX-XXXX-XXXX) that activates locally — no account needed.

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the full policy. Short version: we store nothing, send nothing, track nothing. Your clips live in your browser and nowhere else.

## License

Proprietary — All rights reserved.
