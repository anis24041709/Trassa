# TRASSA Portal V4.5

Fix für die Detailansicht unter **Anfragen**.

## Behoben
- Klick auf eine eigene Anfrage lädt den ausgewählten Datensatz erneut über `GET /api/requests/:id`.
- Die Detailansicht verwendet dadurch die Werte aus PostgreSQL.
- Die alte Demo-Funktion in `public/index.html` darf echte API-Daten nicht mehr überschreiben.
- `window.__trassaCurrentRequest` hält ausschließlich die aktuell ausgewählte reale Anfrage.
- `openRequestDetail` wird explizit als globale API-Funktion registriert, damit Inline-Klicks nicht auf die alte Demo-Funktion fallen.

## Für GitHub
Am einfachsten den kompletten Inhalt ersetzen. Für diesen Fehler sind insbesondere wichtig:
- `public/index.html`
- `public/api-adapter.js`

Danach in Render: **Manual Deploy → Deploy latest commit**.
