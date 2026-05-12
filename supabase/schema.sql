-- MoSaidCuts – database schema
-- How to run:
--   1. Open your Supabase project → SQL Editor
--   2. Paste the entire contents of this file and click Run
--   3. Tables are created with IF NOT EXISTS — safe to re-run
-- ---------------------------------------------------------------------------

-- bookings
-- Stores all customer appointments.
CREATE TABLE IF NOT EXISTS bookings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,          -- e.g. MSC3X7KQ
  name        text NOT NULL,
  phone       text NOT NULL,
  email       text NOT NULL,
  service     text NOT NULL,
  price       numeric(10,2),
  duration    integer,                       -- minutes
  date        date NOT NULL,
  time        text NOT NULL,                 -- HH:MM
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_date_idx   ON bookings (date);
CREATE INDEX IF NOT EXISTS bookings_email_idx  ON bookings (email);
CREATE INDEX IF NOT EXISTS bookings_code_idx   ON bookings (code);

-- settings
-- Key/value store for portal configuration (e.g. portal_password_hash, blocked_dates).
CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- banned_emails
-- Prevents specific email addresses from making new bookings.
CREATE TABLE IF NOT EXISTS banned_emails (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email     text NOT NULL UNIQUE,
  reason    text NOT NULL DEFAULT '',
  banned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS banned_emails_email_idx ON banned_emails (email);

-- verification_codes
-- 6-digit codes sent by e-mail to confirm bookings.
-- The `code` column stores a SHA-256 hash of the actual code.
CREATE TABLE IF NOT EXISTS verification_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code        text NOT NULL,                 -- SHA-256 hash of the 6-digit code
  expires_at  timestamptz NOT NULL,
  used        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_codes_email_idx ON verification_codes (email);
