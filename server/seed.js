import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const email=process.env.ADMIN_EMAIL;
const password=process.env.ADMIN_PASSWORD;
if(!email||!password){console.error('ADMIN_EMAIL und ADMIN_PASSWORD setzen.');process.exit(1);}
const client=await pool.connect();
try{await client.query('BEGIN');const c=await client.query(`INSERT INTO companies(name,role,email,is_verified) VALUES($1,'Sonstige',$2,true) ON CONFLICT DO NOTHING RETURNING id`,['TRASSA Administration',email]);let companyId=c.rows[0]?.id;if(!companyId){companyId=(await client.query('SELECT id FROM companies WHERE lower(email)=lower($1)',[email])).rows[0].id;}const hash=await bcrypt.hash(password,12);await client.query(`INSERT INTO users(company_id,email,password_hash,is_admin,email_verified_at) VALUES($1,$2,$3,true,now()) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,is_admin=true,is_active=true,email_verified_at=COALESCE(users.email_verified_at,now())`,[companyId,email.toLowerCase(),hash]);await client.query('COMMIT');console.log('Admin bereit:',email);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
