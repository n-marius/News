# Einrichtung – Schritt für Schritt

Adresse der App: https://n-marius.github.io/News/

## 1. GitHub (einmalig, im Browser)

1. Repository `n-marius/News` öffnen → **Settings** → links **Pages** → bei „Source“ **GitHub Actions** wählen.
2. **Settings** → **Actions** → **General** → ganz unten „Workflow permissions“ → **Read and write permissions** → **Save**.
3. Reiter **Actions** → links „Sammeln und veröffentlichen“ → **Run workflow** → grünen Button drücken. Nach 1–2 Minuten ist die App unter der Adresse oben erreichbar. Danach läuft alles automatisch alle 15 Minuten.

## 2. Push (Cloudflare), auf dem Windows-Rechner

Voraussetzung: Node.js (LTS) von https://nodejs.org installiert.

1. Auf GitHub im Repository **Code** → **Download ZIP**, entpacken. Im entpackten Ordner den Unterordner `worker` öffnen, oben in die Adressleiste des Explorers `powershell` tippen, Enter. Alle folgenden Befehle dort eingeben.
2. `npx wrangler login` – der Browser öffnet sich, bei Cloudflare mit **Allow** bestätigen.
3. `npx wrangler kv namespace create SUBS` – in der Ausgabe steht eine `id = "…"`. Diese Zeichenfolge in der Datei `wrangler.toml` (Editor) anstelle von `HIER_KV_ID_EINTRAGEN` einsetzen, speichern.
4. `node gen-vapid.mjs` – gibt zwei Werte aus (`VAPID_PUBLIC`, `VAPID_PRIVATE`). Beide notieren.
5. Drei Geheimnisse setzen; bei jedem Befehl fragt das Programm nach dem Wert, einfügen, Enter:
   - `npx wrangler secret put VAPID_PUBLIC`
   - `npx wrangler secret put VAPID_PRIVATE`
   - `npx wrangler secret put NOTIFY_SECRET` – hier ein eigenes langes Passwort; Vorschlag erzeugen mit `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` und notieren.
6. `npx wrangler deploy` – am Ende steht die Adresse des Workers (`https://news-push.…workers.dev`). Notieren.
7. Auf GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**; zwei Einträge:
   - `PUSH_WORKER_URL` = Adresse aus Schritt 6
   - `PUSH_SECRET` = Passwort aus Schritt 5
8. Die Worker-Adresse zusätzlich in `config/app.json` eintragen (`"workerUrl": "…"`; auf GitHub Datei öffnen → Stift-Symbol → **Commit changes**) – oder Claude die Adresse nennen.

## 3. iPhone

1. In **Safari** https://n-marius.github.io/News/ öffnen → Teilen-Symbol → **Zum Home-Bildschirm** → **Hinzufügen**.
2. Die App **vom Home-Bildschirm** öffnen (nicht aus Safari). Oben rechts auf die **Glocke** tippen → **Benachrichtigungen aktivieren** → iOS-Abfrage mit **Erlauben** bestätigen. (Voraussetzung: iOS 16.4 oder neuer.)

## 4. Widget (Scriptable)

1. App **Scriptable** aus dem App Store laden.
2. In Scriptable oben rechts **+** → den gesamten Inhalt von `widget/news-widget.js` einfügen (auf GitHub Datei öffnen → „Raw“ → alles kopieren) → Name oben: „News“ → fertig.
3. Home-Bildschirm lange drücken → **+** → **Scriptable** → mittlere Größe → hinzufügen → Widget antippen → bei „Script“ **News** wählen. Optional bei „Parameter“ `iwr`, `ukraine` oder `sabotage` eintragen, um nur ein Thema zu zeigen.
4. Tipp auf einen Artikel öffnet ihn, Tipp auf den Rest öffnet die App.

## 5. Push später auf Eilmeldungen beschränken

In `config/push.json` `"mode": "all"` auf `"mode": "breaking"` ändern. Nur Meldungen mit Eil-Markierung der Quelle (Muster in `config/sources.json` unter `breakingPattern`) lösen dann Push aus. Mit der Liste `breakingKeywords` in `config/keywords.json` lässt sich das weiter eingrenzen.

## Hinweise

- `data/status.json` zeigt, welche Quellen im letzten Lauf nicht erreichbar waren (aktuell erwartbar: IISD, GTAI).
- Der Sammler läuft über GitHub-Server; manche Seiten sperren diese Adressen gelegentlich. Fällt eine Quelle dauerhaft aus, melden.
