CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('EVU','Wagenhalter','Kranunternehmen','Logistiker','Sonstige')),
  contact_name text,
  phone text,
  email text,
  vat_id text,
  address_line text,
  postal_code text,
  city text,
  country text NOT NULL DEFAULT 'DE',
  notification_offers boolean NOT NULL DEFAULT true,
  notification_messages boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_admin boolean NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  verification_token_hash text,
  verification_expires_at timestamptz,
  reset_token_hash text,
  reset_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE INDEX IF NOT EXISTS users_company_idx ON users(company_id);

CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id bigserial UNIQUE NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id),
  start_location text NOT NULL,
  destination text NOT NULL,
  from_date date,
  to_date date,
  weight_t numeric(12,2),
  loading_gauge text,
  wagon_type text,
  hazardous_goods boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','new','progress','awarded','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS requests_status_idx ON requests(status);
CREATE INDEX IF NOT EXISTS requests_company_idx ON requests(company_id);
CREATE INDEX IF NOT EXISTS requests_dates_idx ON requests(from_date,to_date);

CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  provider_company_id uuid NOT NULL REFERENCES companies(id),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  valid_until date,
  contact_name text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, provider_company_id)
);
CREATE INDEX IF NOT EXISTS offers_request_idx ON offers(request_id);
CREATE INDEX IF NOT EXISTS offers_provider_idx ON offers(provider_company_id);

CREATE TABLE IF NOT EXISTS transports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES requests(id),
  offer_id uuid UNIQUE REFERENCES offers(id),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','underway','done','cancelled')),
  scheduled_from date,
  scheduled_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, company_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_id uuid REFERENCES requests(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  stored_name text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint NOT NULL,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_company_idx ON documents(company_id);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  type text NOT NULL,
  amount_cents integer NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_id uuid NOT NULL REFERENCES transports(id) ON DELETE CASCADE,
  from_company_id uuid NOT NULL REFERENCES companies(id),
  to_company_id uuid NOT NULL REFERENCES companies(id),
  reliability integer CHECK (reliability BETWEEN 1 AND 5),
  communication integer CHECK (communication BETWEEN 1 AND 5),
  punctuality integer CHECK (punctuality BETWEEN 1 AND 5),
  quality integer CHECK (quality BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(transport_id, from_company_id)
);

CREATE TABLE IF NOT EXISTS activity (
  id bigserial PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  icon text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_company_idx ON activity(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

-- Safe upgrades for databases created with the first backend version.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_id text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_line text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'DE';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
