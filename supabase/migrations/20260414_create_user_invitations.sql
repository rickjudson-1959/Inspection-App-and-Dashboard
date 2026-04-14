-- Custom invitation tokens with 7-day expiry
-- Replaces Supabase Auth's default 24-hour invite tokens

CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  organization_id UUID,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  redirect_to TEXT
);

CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON user_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_expires ON user_invitations(expires_at) WHERE accepted_at IS NULL;

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invitations"
  ON user_invitations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert invitations"
  ON user_invitations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update invitations"
  ON user_invitations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow anonymous users to read invitations (for token verification on accept-invite page)
CREATE POLICY "Anonymous can read invitations for verification"
  ON user_invitations FOR SELECT TO anon USING (true);
