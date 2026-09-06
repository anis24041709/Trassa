import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function upsertUser(client, { companyName, role, email, password, isAdmin = false, verified = true }) {
  const existing = await client.query('SELECT u.id, u.company_id FROM users u WHERE lower(u.email)=lower($1)', [email]);
  const hash = await bcrypt.hash(password, 12);
  if (existing.rowCount) {
    await client.query(
      `UPDATE users SET password_hash=$1, is_admin=$2, is_active=true,
        email_verified_at=CASE WHEN $3 THEN COALESCE(email_verified_at, now()) ELSE email_verified_at END
       WHERE id=$4`,
      [hash, isAdmin, verified, existing.rows[0].id]
    );
    await client.query('UPDATE companies SET name=$1, role=$2, is_verified=true WHERE id=$3', [
      companyName,
      role,
      existing.rows[0].company_id,
    ]);
    return { userId: existing.rows[0].id, companyId: existing.rows[0].company_id };
  }
  const c = await client.query(
    `INSERT INTO companies(name, role, email, is_verified) VALUES($1,$2,lower($3),true) RETURNING id`,
    [companyName, role, email]
  );
  const companyId = c.rows[0].id;
  const u = await client.query(
    `INSERT INTO users(company_id, email, password_hash, is_admin, is_active, email_verified_at)
     VALUES($1, lower($2), $3, $4, true, $5) RETURNING id`,
    [companyId, email, hash, isAdmin, verified ? new Date() : null]
  );
  return { userId: u.rows[0].id, companyId };
}

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await upsertUser(client, {
      companyName: 'TRASSA Administration',
      role: 'Sonstige',
      email: adminEmail,
      password: adminPassword,
      isAdmin: true,
    });
    console.log('Admin bereit:', adminEmail);
  }

  const customer = await upsertUser(client, {
    companyName: 'RheinCargo Logistik GmbH',
    role: 'Logistiker',
    email: 'auftraggeber@demo.trassa',
    password: 'Demo1234!',
  });
  console.log('Auftraggeber: auftraggeber@demo.trassa / Demo1234!');

  const provider = await upsertUser(client, {
    companyName: 'Nordbahn Transport AG',
    role: 'EVU',
    email: 'anbieter@demo.trassa',
    password: 'Demo1234!',
  });
  console.log('Anbieter:     anbieter@demo.trassa / Demo1234!');

  let req = await client.query(
    `SELECT id, public_id FROM requests WHERE company_id=$1 AND title=$2 LIMIT 1`,
    [customer.companyId, 'Gleisbagger-Transport Köln → Hannover']
  );
  if (!req.rowCount) {
    req = await client.query(
      `INSERT INTO requests(
        company_id, start_location, destination, from_date, to_date,
        weight_t, loading_gauge, wagon_type, hazardous_goods, title, description, status
      ) VALUES(
        $1, 'Köln Eifeltor', 'Hannover Messe/Laatzen',
        CURRENT_DATE + 14, CURRENT_DATE + 21,
        64, 'G2', 'Flachwagen', false,
        'Gleisbagger-Transport Köln → Hannover',
        'Kranentladung am Zielort erforderlich.',
        'new'
      ) RETURNING id, public_id`,
      [customer.companyId]
    );
    console.log('Demo-Anfrage angelegt #TR-' + req.rows[0].public_id);
  } else {
    console.log('Demo-Anfrage vorhanden #TR-' + req.rows[0].public_id);
  }
  const requestId = req.rows[0].id;

  const existingOffer = await client.query(
    `SELECT id FROM offers WHERE request_id=$1 AND provider_company_id=$2`,
    [requestId, provider.companyId]
  );
  if (!existingOffer.rowCount) {
    const offer = await client.query(
      `INSERT INTO offers(request_id, provider_company_id, price_cents, valid_until, contact_name, note, status)
       VALUES($1,$2,$3,CURRENT_DATE + 30,'Max Mustermann','Inkl. Rangierleistung am Zielbahnhof.','pending')
       RETURNING id`,
      [requestId, provider.companyId, 1250000]
    );
    console.log('Demo-Angebot angelegt:', offer.rows[0].id);
  } else {
    console.log('Demo-Angebot vorhanden:', existingOffer.rows[0].id);
  }

  await client.query(
    `INSERT INTO activity(company_id, icon, text) VALUES
      ($1, '📋', 'Demo-Anfrage veröffentlicht'),
      ($1, '💼', 'Neues Angebot eingegangen'),
      ($2, '💼', 'Angebot abgegeben')`,
    [customer.companyId, provider.companyId]
  );

  await client.query('COMMIT');
  console.log('\nSeed fertig. Testen mit beiden Demo-Konten.');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
