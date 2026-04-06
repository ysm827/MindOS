# MindOS Web Clipper

Save any web page to your MindOS knowledge base — one click, clean Markdown.

## Install (3 steps)

**No build required — the `extension/` folder is ready to load.**

1. Open Chrome → go to `chrome://extensions`
2. Turn on **Developer mode** (top right toggle)
3. Click **Load unpacked** → select the `extension/` folder inside this directory

Done. You'll see the MindOS icon in your toolbar.

## First-time setup

1. Click the MindOS icon in your toolbar
2. Enter your MindOS URL (default: `http://localhost:3456`)
3. Paste your Auth Token (find it in MindOS → Settings → MCP)
4. Click **Connect**

## How to clip

- **Click the icon** to clip the current page
- **Right-click** → "Save to MindOS" on any page
- **Keyboard shortcut**: `Ctrl+Shift+M` (Mac: `Cmd+Shift+M`)

Choose a folder, edit the title if needed, and hit **Save to MindOS**.

## What gets saved

```
---
title: Article Title
source: https://example.com/article
author: Author Name
site: example.com
saved: 2025-01-15T10:30:00Z
---

# Article Title

Clean markdown content...
```

## Features

- Smart content extraction (Mozilla Readability — strips ads, nav, etc.)
- YAML frontmatter with metadata
- Space/folder selector
- Dark mode (follows system)
- Keyboard shortcut + right-click menu

## For developers

```bash
npm install     # install dependencies
npm run build   # rebuild extension/ from src/
npm run watch   # rebuild on file changes
npm run package # create .zip for Chrome Web Store
```

## Supported browsers

- Chrome 120+
- Edge 120+
- Brave, Arc, and other Chromium browsers
