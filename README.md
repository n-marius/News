# News

Private News-PWA (Google-News-Stil) mit Feed-Sammler, Push-Worker und Scriptable-Widget. Maßgeblich: `SPEC.md`. Einrichtung: `docs/ANLEITUNG.md`.

- `scripts/fetch.mjs` – Sammler (GitHub Action alle 15 Minuten), schreibt `data/feed.json`
- `index.html`, `app.js`, `styles.css`, `sw.js` – die App
- `worker/` – Cloudflare Worker für Push
- `widget/news-widget.js` – Scriptable-Widget
- `config/` – Quellen, Stichwörter, Push-Modus
