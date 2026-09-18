# Z Key — Printable PDF Notes (PWA)

A free, mobile-first Progressive Web App that turns any study PDF into a
printable, paper-saving handout — entirely on the student's device. No
account, no login, no server upload, no ads.

## What it does

```
PDF → Add/Remove Pages → Slides Per Page → Color/B&W → Border → Preview → Generate PDF → Download/Share/Print
```

## 1. Run it locally

Browsers block PDF/file APIs on `file://`, so serve the folder over
plain HTTP. Any static server works, e.g.:

```bash
cd z-key
python3 -m http.server 8080
# then open http://localhost:8080 on your computer or phone (same Wi-Fi)
```

or

```bash
npx serve .
```

## 2. Host it online (any static host works, no backend needed)

- **GitHub Pages**: push this folder to a repo, enable Pages on the `main`
  branch (root), done.
- **Netlify / Vercel / Cloudflare Pages**: drag-and-drop the `z-key` folder,
  or connect the repo — no build step required, it's already static.

## 3. Install on Android Chrome

1. Open the hosted Z Key URL in Chrome.
2. Tap the ⋮ menu → **"Add to Home screen"** / **"Install app"**.
3. Confirm — Z Key now opens full-screen like a native app, with its own
   icon, and keeps working offline once loaded once.

## Project structure

```
z-key/
├── index.html            # app shell + all screens
├── manifest.json         # PWA manifest (icons, name, theme)
├── service-worker.js     # offline app-shell caching
├── css/
│   ├── styles.css        # layout, components, animations
│   ├── glass.css         # glassmorphism design tokens
│   └── responsive.css    # tablet/desktop breakpoints
├── js/
│   ├── utils.js           # shared helpers
│   ├── state.js           # single source of truth app state
│   ├── loading.js         # bouncing-circle loading overlay
│   ├── vendor-loader.js   # lazy-loads pdf.js + pdf-lib from CDN
│   ├── pdf-import.js      # safe PDF metadata reading
│   ├── thumbnails.js      # lazy, cached, bounded thumbnail rendering
│   ├── page-manager.js    # Add/Remove Pages screen + blank slide insert
│   ├── layouts.js         # layout definitions + slides-per-page math
│   ├── color-mode.js      # grayscale rasterization (B&W mode only)
│   ├── renderer.js        # shared slot-position math (preview == export)
│   ├── preview.js         # canvas preview, same composition as export
│   ├── export-pdf.js      # final PDF generation via pdf-lib
│   ├── router.js          # screen navigation + bottom bar
│   └── app.js             # wires it all together, welcome animation
└── assets/                # Z Key icon at all required PWA sizes
```

## Architecture notes (why it's memory-safe on large PDFs)

- The original PDF bytes are kept once, untouched, and reused for export —
  never re-uploaded, never fully rasterized.
- **Color mode** never converts pages to images: `pdf-lib`'s `embedPdf`
  embeds the original vector/text page content directly into the output.
- **Black & white mode** rasterizes *only* the source pages that are
  actually used, one at a time, sized to how large they'll actually print
  (not a fixed huge resolution) — never the whole document at once.
- Page thumbnails render lazily (`IntersectionObserver`) and are cached in
  a bounded LRU-style cache (oldest entries evicted after ~60 pages) so a
  200-page PDF doesn't keep 200 canvases in memory.
- Output pages are generated **sequentially**, with `await` yields back to
  the UI thread between pages, so the interface stays responsive during
  export instead of freezing.
- Canvases are explicitly sized to `0×0` after use to help the browser
  release their backing memory promptly.

**Known simplification:** heavy processing currently runs on the main
thread (with frequent yields) rather than in a Web Worker. This keeps the
codebase simple and works well up to roughly 100–150 page documents on a
modern phone; a Worker-based pipeline (rendering via `OffscreenCanvas` in
a worker) would be the next step for guaranteed smoothness on very large
or very old devices. Z Key never promises 150 MB PDFs are guaranteed to
work on every phone — if a device runs out of memory, the app shows a
friendly error instead of crashing silently.

## Layouts implemented

| Slides | Orientation | Grid | Notes |
|---|---|---|---|
| 2  | Portrait  | 1×2 | Large, easy-to-read |
| 6  | Landscape | 3×2 | Balanced |
| 8  | Portrait  | 2×4 | **Recommended** — max paper savings |
| 10 | Portrait  | 2×5 | **Compact** — most slides per page |

## Privacy

Everything happens in the browser. Nothing about the PDF's content, name,
or size is ever sent anywhere. There is no analytics, no tracking, no
account system.

## Optional future step: APK

The project is plain HTML/CSS/JS with no framework lock-in, so it can
later be wrapped with a tool like **Capacitor** to produce an Android APK
if that's ever needed — but the PWA itself is the primary, complete
product and needs no such wrapping to be fully usable.
