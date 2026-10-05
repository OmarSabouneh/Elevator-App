-- Run once in Supabase: SQL Editor → New query → Run
-- (The server also runs this on startup if tables are missing.)

CREATE TABLE IF NOT EXISTS switch_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  indefinite BOOLEAN NOT NULL DEFAULT FALSE,
  is_on BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO switch_state (id, indefinite, is_on) VALUES (1, FALSE, FALSE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  username TEXT UNIQUE,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  access_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  order_id TEXT NOT NULL UNIQUE,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  whish_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS access_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE switch_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

