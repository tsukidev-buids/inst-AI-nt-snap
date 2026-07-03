# ⚡ Inst-AI-nt Snap

Capture any web page's content instantly. Store it locally, export in AI-ready format, or auto-summarize with your own API key.

## Features

- **One-click page capture** — extracts readable text and images from any page
- **Selection capture** — highlight text and clip just that
- **Local storage** — everything stays in your browser, no accounts needed
- **AI-ready export** — copy clips as clean markdown, ready to paste into any AI
- **Optional AI summarization** — add your OpenAI or Anthropic API key for one-click summaries
- **Library** — browse, search, and manage all your clips
- **Download** — export clips as markdown files

## Installation

- **Microsoft Edge:** [Install from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/instaint-snap/mcklnjgpbjfibfjjfkgolijfjadcinff)
- **Google Chrome:** Coming soon
- **Opera:** Coming soon

### Development

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `instant-snap` folder

## Usage

1. Navigate to any web page
2. Click the Inst-AI-nt Snap icon in the toolbar
3. Click "📸 Snap This Page" to capture everything, or "✂️ Snap Selection" for highlighted text
4. View your clips in the Library
5. Export as markdown or summarize with AI

## Settings

- **Storage** — configure auto-export and folder name
- **AI** — add an API key (OpenAI or Anthropic) for one-click summarization
- **Capture** — control max images and metadata inclusion

## Architecture

```
instant-snap/
├── manifest.json        # Extension manifest (MV3)
├── background.js        # Service worker — storage, AI calls, export
├── content.js           # Content script — page text/image extraction
├── popup/               # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/             # Settings page
│   ├── options.html
│   ├── options.css
│   └── options.js
├── icons/               # Extension icons
└── README.md
```

## Privacy

- All data stored locally in `chrome.storage.local`
- No data sent anywhere unless you explicitly configure an AI provider
- API keys stored locally, never transmitted except to the configured AI provider

## License

Proprietary — All rights reserved.
