-- Idempotent initial schema. Run with npm run db:migrate; no seed reports.
CREATE TABLE IF NOT EXISTS reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone varchar(16) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  category text NOT NULL CHECK (category IN ('job','upfront','credentials','payment','impersonation','investment','delivery','support','threats','other')),
  description varchar(500) NOT NULL DEFAULT '', -- private; never returned by public routes
  created_at timestamptz NOT NULL DEFAULT now(),
  visibility text NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden')),
  actor_hash char(64),
  report_day date NOT NULL,
  UNIQUE(phone,category,actor_hash,report_day)
);
CREATE INDEX IF NOT EXISTS reports_visible_phone ON reports(phone) WHERE visibility='visible';
CREATE TABLE IF NOT EXISTS abuse_windows (
  actor_key varchar(80) NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  PRIMARY KEY(actor_key,window_start)
);
CREATE TABLE IF NOT EXISTS review_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone varchar(16) NOT NULL,
  reason text NOT NULL CHECK(reason IN ('misleading','privacy','other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed'))
);
