# Arbeitsregeln für dieses Repo

- Maßgeblich ist `SPEC.md`. Neue Vorgaben des Nutzers dort nachtragen (Abschnitt „Nachträge“).
- Kein Build-Schritt, keine Frameworks, keine externen Libraries (PWA, Sammler, Widget, Worker: nur Vanilla JS, Node-Standardbibliothek).
- Quellenliste ist abschließend (`config/sources.json`). Keine Quellen ohne Rückfrage ergänzen.
- Nach jeder Änderung an App-Dateien `APP_VERSION` in `sw.js` erhöhen; neue Dateien in `SHELL_FILES` aufnehmen.
- Design: Google-News-Stil ohne Branding, Hell-/Dunkelmodus automatisch, Farben nur über CSS-Variablen in `styles.css`. Der Name des Nutzers kommt nirgends in der App oder im Widget vor.
- Icon ändern: immer neue Dateinamen (`icons/icon-*-v1.png` → `-v2` …) und `index.html`, `manifest.webmanifest`, `sw.js` anpassen.
- Secrets (VAPID-Schlüssel, Shared Secret) nie ins Repo. GitHub-Secrets: `PUSH_WORKER_URL`, `PUSH_SECRET`.
- `data/*.json` schreibt nur die Action (`scripts/fetch.mjs`), nie von Hand bearbeiten.
- Der Nutzer ist kein Programmierer: Anleitungen Schritt für Schritt, ohne Fachkürzel, auf Deutsch.
- GitHub: direkt committen, pushen und mergen ist erlaubt. `main` wird per GitHub Pages (Action) ausgeliefert.
