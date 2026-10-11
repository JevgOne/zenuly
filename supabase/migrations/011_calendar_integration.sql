-- =============================================
-- 011: Calendar integration
-- One record = one user has a connected calendar
-- Provider is TEXT with CHECK — easy to extend
-- Provider-specific credentials in JSONB
-- =============================================

CREATE TABLE calendar_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('google', 'notion')),
  credentials     jsonb NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One user = one active calendar
  UNIQUE (profile_id)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendar_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: owner sees own record
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_own ON calendar_connections FOR ALL
  USING (profile_id = auth.uid());

-- Admin can read all (for reading target user's token when creating events)
CREATE POLICY cc_admin_read ON calendar_connections FOR SELECT
  USING (auth_user_role() = 'admin');

-- =============================================
-- Extend tasks table with calendar event tracking
-- =============================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_event_id text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_provider text;
