# TRASSA Portal 2.0 – produktionsnahes Backend

Dieses Projekt verbindet den TRASSA-Portal-Client mit einem echten Express/PostgreSQL-Backend. Der Client deckt Marktplatz, Anfragen, Angebote, Transporte, Nachrichten, Dokumente, Abrechnung und Einstellungen ab; diese Daten werden serverseitig gespeichert.

## Neu in 2.0
- PostgreSQL mit Upgrades für bestehende Datenbanken
- echte Registrierung/Login mit bcrypt
- HTTP-only Session-Cookie + JWT
- CSRF-Schutz für zustandsändernde Requests
- E-Mail-Verifizierung
- Passwort-Reset per SMTP
- Rollen: Unternehmensart + separater Admin-Status
- Angebote abgeben, annehmen, ablehnen und zurückziehen
- automatische Erzeugung eines Transports bei Annahme
- Transportstatus und Bewertungen
- Gesprächserstellung und Nachrichten
- Dokument-Upload mit Größen-/MIME-Prüfung und SHA-256
- Unternehmensprofil mit Rechnungsdaten
- Rechnungen
- Audit-Log
- Admin-API für Statistiken, Unternehmen, Audit und Rechnungen
- Render Blueprint

## Lokal starten

```bash
cp .env.example .env
docker compose up --build
```

Danach: `http://localhost:3000`

Für einen Admin:

```bash
ADMIN_EMAIL=admin@deine-domain.de ADMIN_PASSWORD='Ein-sehr-starkes-Passwort' npm run seed
```

## SMTP

Für E-Mail-Verifizierung und Passwort-Reset müssen `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` und `MAIL_FROM` gesetzt werden. Ohne SMTP werden diese Nachrichten nicht versendet.

## API-Schwerpunkte

Auth: `/api/auth/*`

Portal: `/api/dashboard`, `/api/requests`, `/api/offers`, `/api/transports`, `/api/conversations`, `/api/documents`, `/api/billing`, `/api/settings`

Bewertungen: `/api/transports/:id/rating`, `/api/companies/:id/ratings`

Admin: `/api/admin/*`

## Produktion

Für einen öffentlichen Betrieb:
1. HTTPS verwenden und `COOKIE_SECURE=true` setzen.
2. Starken `JWT_SECRET` verwenden.
3. SMTP konfigurieren.
4. PostgreSQL-Backups und Monitoring aktivieren.
5. Für echte Produktion Dokumente in S3/R2/Azure Blob statt lokaler Web-Disk speichern.
6. DSGVO-Prozesse (Löschung, Export, Aufbewahrung, AV-Verträge) ergänzen.
7. Vor Livegang Security-/Penetrationstest und Datenschutzprüfung durchführen.

## Admin-Bereich

Die Admin-Oberfläche ist unter `/admin` erreichbar. Alle Admin-API-Routen sind serverseitig mit `is_admin` geschützt.

Für den ersten Administrator in Produktion zwei Environment-Variablen setzen und den Service neu deployen:

```env
ADMIN_EMAIL=admin@deine-domain.de
ADMIN_PASSWORD=ein-sehr-sicheres-passwort-mit-mindestens-10-zeichen
```

Beim Start legt der Server diesen Administrator an oder aktualisiert das vorhandene Konto mit derselben E-Mail. Danach kann der Admin unter `/admin` anmelden.

Der Admin-Bereich enthält Dashboard-Kennzahlen, Unternehmen/Verifizierung, Benutzer-Sperren und Admin-Rechte, Anfragen, Angebote, Transporte, Rechnungen und Audit-Log.
