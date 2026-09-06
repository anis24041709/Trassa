# TRASSA V4.8 – Request-ID Fix

Behoben: Klick auf Anfragen im Dashboard bzw. in der Anfragen-Liste konnte einen HTTP-500-Fehler auslösen.

Ursache: `requestDto()` ersetzte die echte UUID aus PostgreSQL durch die sichtbare Nummer `#TR-…`. Der Detail-Endpunkt `/api/requests/:id` erwartet jedoch die UUID.

V4.8 behält jetzt:
- `id` = echte PostgreSQL-UUID
- `public_id` = öffentliche numerische Anfrage-ID
- `request_number` = Anzeigeformat `#TR-…`

Damit können Dashboard und Anfragen-Liste denselben Detail-Endpunkt zuverlässig öffnen.
