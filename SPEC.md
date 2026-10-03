# News-PWA – Projektspezifikation

## Ziel
Private News-App (PWA) für iPhone im Stil von Google News. Sie liefert Artikel aus einer **abschließenden Quellenliste** zu drei Themen. Dazu kommen Push-Benachrichtigungen für Eilmeldungen und ein Scriptable-Widget. Repo: `News` (GitHub), Hosting über GitHub Pages. Entwicklungsrechner: Windows.

## Architektur
1. **Feed-Sammler** (`scripts/fetch.mjs`, Node): Läuft per GitHub Action (cron alle 15 Min. sowie manuell auslösbar). Er liest `config/sources.json`, holt die RSS/Atom-Feeds, filtert sie nach `config/keywords.json`, entfernt Dubletten (URL bzw. normalisierter Titel), extrahiert das Bild (media:content, enclosure oder og:image als Fallback) und schreibt `data/feed.json` (max. 300 Einträge, ältere als 14 Tage entfallen). Commit nur bei Änderungen.
2. **PWA** (`/index.html`, Vanilla JS oder leichtgewichtig, kein Build-Schritt nötig): Liest `data/feed.json`.
3. **Push** (`worker/`, Cloudflare Worker + KV, Web Push mit VAPID): Der Worker speichert das Push-Abo des iPhones. Der Feed-Sammler meldet neue Eilmeldungen per POST an den Worker (abgesichert durch ein Shared Secret), und der Worker versendet sie.
4. **Widget** (`widget/news-widget.js` für Scriptable): Liest `data/feed.json`.

Secrets (VAPID-Keys, Shared Secret, Worker-URL) gehören in GitHub Secrets bzw. Cloudflare-Secrets, niemals ins Repo.

## Quellen (abschließend)
Die Liste ist abschließend: Es werden keine weiteren Quellen ergänzt, ohne mich zu fragen. **Erster Arbeitsschritt:** Für jede Quelle den RSS-Feed ermitteln und testen. Gib mir eine Tabelle aus mit Quelle, Feed-URL, funktioniert ja/nein, Bilder ja/nein, Eil-Markierung erkennbar ja/nein und Paywall-Anteil. Quellen ohne Feed oder mit nennenswerter Paywall erst nach Rücksprache streichen.

Jede Quelle erhält in `sources.json` die Felder `id`, `name`, `url`, `feed`, `topics[]`, `filter` (`all` = Feed vollständig übernehmen bzw. `keywords` = nur Treffer) und `type` (`serioes` oder `schnell`).

**Internationales Wirtschaftsrecht**
- LTO (keywords), beck-aktuell (keywords)
- EJIL:Talk!, International Economic Law and Policy Blog, Kluwer Arbitration Blog, Völkerrechtsblog (all)
- GTAI – Zoll/Recht (all)
- Entscheidungen und Rechtsänderungen: EuGH-Pressemitteilungen (keywords), WTO Dispute Settlement News (all), ICSID News (all), IISD Investment Treaty News (all), BAFA Außenwirtschaft/Exportkontrolle (all), Rat der EU – Pressemitteilungen zu Sanktionen/Handel (keywords), EUR-Lex-RSS zu Handels-/Sanktionsrecht (all, falls konfigurierbar)

**Krieg in der Ukraine**
- Filter keywords: tagesschau, DW (de/en), ZDFheute
- Filter all: Kyiv Independent (en), Ukrinform (en/de), Ukrainska Pravda (en), Euromaidan Press (en), ISW (Feed prüfen, nicht ISW-fremde Inhalte)
- Kyiv Post ist ausgeschlossen (Paywall).

**Anschläge und Sabotage in Deutschland**
- seriös: tagesschau, NDR, MDR, BR24, rbb24, Deutschlandfunk (alle keywords)
- schnell: n-tv, t-online, Focus Online (keywords). Bild nur, wenn BILDplus-Artikel zuverlässig erkennbar und ausfilterbar sind, sonst weglassen und mir mitteilen.
- In der UI erhalten schnelle Quellen ein dezentes Label „schnell/unbestätigt“.

## Stichwortfilter (`config/keywords.json`, Startversion, später anpassbar)
Groß-/Kleinschreibung ignorieren, Wortgrenzen beachten, deutsche und englische Begriffe. Geprüft werden Titel und Teaser.

- **iwr:** WTO, Welthandelsorganisation, Schiedsgericht, Schiedsverfahren, Schiedsspruch, arbitration, award, ICSID, ISDS, Investitionsschutz, investment treaty, BIT, Energiecharta, ECT, Handelsabkommen, Freihandelsabkommen, trade agreement, CETA, Mercosur, Zoll, Zölle, Strafzoll, tariff, Antidumping, Ausgleichszoll, Sanktionen, sanctions, Embargo, Exportkontrolle, export control, Dual-Use, Außenwirtschaftsgesetz, AWG, AWV, Investitionsprüfung, FDI-Screening, Anti-Coercion, CBAM, Lieferkettengesetz, LkSG, CSDDD, Lieferkettenrichtlinie, Völkerrecht, Wirtschaftsvölkerrecht
- **ukraine:** Ukraine, ukrainisch, Kyjiw, Kiew, Kyiv, Selenskyj, Zelensky, Charkiw, Odesa, Odessa, Donbas, Krim, Front, Kriegsgefangene, Putin + Krieg, Russland + Angriff (Kombination: beide Begriffe müssen vorkommen)
- **sabotage:** Sabotage, Saboteur, Anschlag, Brandanschlag, Sprengstoffanschlag, Sprengsatz, Terror, Terroranschlag, Anschlagsplan, Spionage, Spion, Agent, GRU, FSB, hybride Bedrohung, hybrider Angriff, Drohnen über, Drohnensichtung, Kabel beschädigt, Unterseekabel, Bahnstrecke Sabotage, Brandstiftung + Bahn, kritische Infrastruktur, KRITIS, Generalbundesanwalt, Bundesanwaltschaft, Verfassungsschutz
- Ein Artikel darf mehreren Themen zugeordnet sein.

## Eilmeldungen / Push
- Push nur für Artikel, die **von der Quelle selbst** als Eilmeldung markiert sind (z. B. Titelpräfix „Eilmeldung“, „EIL“, „+++“, „Breaking“, Feed-Kategorie oder eigener Eil-Feed). Pro Quelle ermitteln, wie die Markierung aussieht, und in `sources.json` als `breakingPattern` hinterlegen.
- Optional eine zusätzliche Liste `breakingKeywords` (zunächst leer): Wenn sie befüllt ist, löst nur eine Eilmeldung **und** ein Treffer daraus einen Push aus.
- Jede Meldung nur einmal pushen (bereits gepushte IDs speichern).
- Push-Text: Quelle + Titel, Tap öffnet den Artikel.
- In der App: Button „Benachrichtigungen aktivieren“ (iOS erlaubt das nur nach Nutzeraktion und nur in der installierten Home-Bildschirm-App ab iOS 16.4).

## UI (Google-News-Stil, ohne Google-Branding)
- Kopf: Suche (lokal im Feed), Titel „News“, oben scrollbare Reiter: **Für mich** (alle drei Themen gemischt) | **Wirtschaftsrecht** | **Ukraine** | **Sabotage**
- Für-mich-Start: großer Top-Artikel (Bild links, Quelle mit Favicon, Titel, Teaser, „vor X h“), darunter zweispaltige Karten (iPad/Querformat) bzw. einspaltige Liste (iPhone)
- Favicon der Quelle, relative Zeitangabe, Tap öffnet den Originalartikel
- **Hell/Dunkel automatisch** über `prefers-color-scheme`; Farben als CSS-Variablen
- Pull-to-Refresh, Service Worker für Offline-Cache, Safe-Area-Insets beachten
- Icon/Logo: im Stil meiner bestehenden PWA-Repos (Links gebe ich dir), alle nötigen Größen inkl. `apple-touch-icon`

## Scriptable-Widget
- Mittlere Widget-Größe: Kopfzeile „Auswahl für M.“, drei neueste Artikel aus „Für mich“ mit Titel (max. 3 Zeilen), Quelle · Zeit und Vorschaubild rechts; darunter „Mehr Nachrichten“
- Hell/Dunkel automatisch (`Device.isUsingDarkAppearance()`)
- Tap auf einen Artikel öffnet den Artikel, Tap auf den Rest öffnet die PWA
- Optional per Widget-Parameter ein einzelnes Thema anzeigen (`iwr`, `ukraine`, `sabotage`)

## Ablauf
1. Feeds prüfen und Tabelle ausgeben (siehe oben), dann auf mein OK warten.
2. Feed-Sammler + Action + PWA bauen, GitHub Pages aktivieren.
3. Cloudflare: Ich lege den Account selbst an. Danach `npx wrangler login`, Worker + KV deployen, VAPID-Keys erzeugen, Secrets setzen.
4. Widget-Skript erstellen.
5. Mir eine Schritt-für-Schritt-Anleitung geben: App zum Home-Bildschirm hinzufügen, Push aktivieren, Scriptable einrichten, Widget platzieren.
6. Bei jedem Schritt, der eine Aktion von mir erfordert (Login, Einstellungen auf GitHub/Cloudflare, iPhone), kurz und konkret sagen, was ich tun muss.

## Nachträge
- Reiter: Für mich | Wirtschaftsrecht | Ukraine | Sabotage.
- Der Name des Nutzers erscheint nirgends (Widget-Kopfzeile: „Auswahl für dich“, Fußzeile: „Mehr Nachrichten für dich“).
- Push vorerst für alle neuen Nachrichten (gesammelt je Abruf), umschaltbar auf nur Eilmeldungen in `config/push.json`.
- Bild: aufgenommen (Typ schnell), BILDplus-Artikel (`<bild:premium>true`) werden verworfen.
- Quellen ohne RSS-Feed: ISW (WordPress-API), ICSID und BR24 (Seitenauslese). EUR-Lex gestrichen. EuGH ohne Feed (deaktiviert). GTAI, IISD: Feed-Zugriff aus Rechenzentren teils gesperrt, als optional geführt.
- Auslieferung per GitHub Pages über Action (Quelle „GitHub Actions“), damit auch Commits der Action zur Veröffentlichung führen.
- Die Worker-URL steht in `config/app.json` (öffentlich nutzbar, kein Geheimnis im technischen Sinn; die Schreibzugriffe schützt das Shared Secret).
