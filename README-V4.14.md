# TRASSA V4.14

Angebotsdetails wurden erweitert:

- "Nachricht vom Anbieter" entfernt
- eingebettetes Chatfenster direkt in der Angebotsdetailansicht
- Chat wird automatisch mit dem jeweiligen Auftraggeber/Anbieter verbunden
- Nachrichten können direkt in der Detailansicht gesendet werden
- Formular zum Ändern/Aktualisieren des Angebotspreises
- Preisänderung nur für den Anbieter und nur bei offenen Angeboten
- Auftraggeber sieht bei offenen Angeboten weiterhin Annehmen/Ablehnen
- Anbieter kann offene Angebote zurückziehen
- Transportzeit und Ansprechpartner bleiben sichtbar

## Lokal testen

```bash
cp .env.example .env
# JWT_SECRET und ggf. ADMIN_* setzen
docker compose up --build
# in anderem Terminal:
npm run seed
```

Demo-Konten (nach Seed):

| Rolle        | E-Mail                      | Passwort   |
|-------------|-----------------------------|------------|
| Auftraggeber | auftraggeber@demo.trassa   | Demo1234!  |
| Anbieter     | anbieter@demo.trassa       | Demo1234!  |

Testablauf:

1. Als **Anbieter** einloggen → Angebote → Detail öffnen
2. Preis ändern und speichern
3. Nachricht im eingebetteten Chat senden
4. Ausloggen, als **Auftraggeber** einloggen → Angebote → gleiches Angebot
5. Chat-Antwort senden, optional Annehmen/Ablehnen

API:

- `GET  /api/offers/:id`
- `PATCH /api/offers/:id/price`  `{ "price_cents": 1300000 }`
- `PATCH /api/offers/:id`        `{ "status": "accepted"|"declined"|"withdrawn" }`
- `POST /api/conversations`      `{ "request_id", "company_id" }`
- `POST /api/conversations/:id/messages` `{ "body": "…" }`
