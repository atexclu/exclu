-- ============================================================================
-- Migration 106: Agency Claim Requests Table
-- ============================================================================
-- Creates table to track agency claim requests for admin approval
-- ============================================================================

CREATE TABLE IF NOT EXISTS agency_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Agency being claimed
  agency_id uuid NOT NULL REFERENCES directory_agencies(id) ON DELETE CASCADE,
  
  -- Requester information
  requester_email text NOT NULL CHECK (requester_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  requester_name text,
  requester_company text,
  requester_message text,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Admin response
  reviewed_by_admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  admin_notes text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agency_claim_requests_agency 
  ON agency_claim_requests(agency_id);

CREATE INDEX IF NOT EXISTS idx_agency_claim_requests_status 
  ON agency_claim_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_claim_requests_email 
  ON agency_claim_requests(requester_email);

-- RLS
ALTER TABLE agency_claim_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a claim request (public form)
DROP POLICY IF EXISTS "Anyone can submit agency claim requests" ON agency_claim_requests;
CREATE POLICY "Anyone can submit agency claim requests"
  ON agency_claim_requests FOR INSERT
  WITH CHECK (true);

-- Service role can manage all requests (admin operations)
DROP POLICY IF EXISTS "Service role can manage claim requests" ON agency_claim_requests;
CREATE POLICY "Service role can manage claim requests"
  ON agency_claim_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can view and update claim requests
DROP POLICY IF EXISTS "Admins can view claim requests" ON agency_claim_requests;
CREATE POLICY "Admins can view claim requests"
  ON agency_claim_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update claim requests" ON agency_claim_requests;
CREATE POLICY "Admins can update claim requests"
  ON agency_claim_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

COMMENT ON TABLE agency_claim_requests IS 'Tracks requests from real agencies to claim their directory profiles. Admins review and approve/reject via admin panel.';
