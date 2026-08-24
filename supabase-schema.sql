-- BrandsIntel Database Schema
-- Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- ============================================================
-- BUSINESSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name VARCHAR(255) NOT NULL UNIQUE,
  website VARCHAR(255),
  social_handle VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  cac_number VARCHAR(50),
  business_type VARCHAR(100),
  industry VARCHAR(100),
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_business_name ON businesses(business_name);
CREATE INDEX idx_website ON businesses(website);

-- ============================================================
-- WEBSITE DATA TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS website_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  url VARCHAR(255),
  domain VARCHAR(255),
  registrant VARCHAR(255),
  registration_date DATE,
  expiry_date DATE,
  ssl_valid BOOLEAN,
  whois_checked_at TIMESTAMP,
  wayback_snapshots INTEGER,
  historical_changes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_website_business_id ON website_data(business_id);

-- ============================================================
-- SOCIAL ACCOUNTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  platform VARCHAR(50), -- instagram, twitter, linkedin, tiktok, facebook
  handle VARCHAR(255),
  verified_by_platform BOOLEAN DEFAULT FALSE,
  follower_count INTEGER,
  account_age_days INTEGER,
  last_checked TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_social_business_id ON social_accounts(business_id);
CREATE INDEX idx_social_platform ON social_accounts(platform);

-- ============================================================
-- PAYMENT ACCOUNTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  bank VARCHAR(100),
  account_name VARCHAR(255),
  account_number_last_four VARCHAR(4),
  account_number_hash VARCHAR(255), -- hashed for security
  verified BOOLEAN DEFAULT FALSE,
  verification_source VARCHAR(100),
  associated_complaints INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_business_id ON payment_accounts(business_id);
CREATE INDEX idx_payment_account_hash ON payment_accounts(account_number_hash);

-- ============================================================
-- USER REPORTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  business_name VARCHAR(255),
  report_type VARCHAR(50), -- non_delivery, scam, payment_fraud, impersonation, refund_issue, other
  description TEXT,
  severity VARCHAR(20), -- low, medium, high
  status VARCHAR(50) DEFAULT 'pending', -- pending, verified, dismissed
  verified_by_admin BOOLEAN DEFAULT FALSE,
  evidence JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_report_business_id ON user_reports(business_id);
CREATE INDEX idx_report_type ON user_reports(report_type);
CREATE INDEX idx_report_status ON user_reports(status);

-- ============================================================
-- RISK PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  trust_score INTEGER, -- 0-100
  risk_level VARCHAR(50), -- established, caution, elevated_risk, high_risk, insufficient_data
  key_indicators TEXT[], -- array of risk factors
  explanation TEXT,
  confidence_score INTEGER, -- 0-100
  generated_at TIMESTAMP DEFAULT NOW(),
  next_review_at TIMESTAMP,
  evidence_summary JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_risk_business_id ON risk_profiles(business_id);
CREATE INDEX idx_risk_level ON risk_profiles(risk_level);
CREATE INDEX idx_risk_score ON risk_profiles(trust_score);

-- ============================================================
-- IMPERSONATION ALERTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS impersonation_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  platform VARCHAR(50), -- instagram, twitter, etc
  fake_handle VARCHAR(255),
  real_handle VARCHAR(255),
  follower_count INTEGER,
  report_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active', -- active, resolved, false_positive
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_impersonation_business_id ON impersonation_alerts(business_id);
CREATE INDEX idx_impersonation_platform ON impersonation_alerts(platform);

-- ============================================================
-- VERIFICATION ACTIVITY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  verification_type VARCHAR(50), -- web_check, payment_check, social_check, full_check
  user_country VARCHAR(2) DEFAULT 'NG',
  result VARCHAR(50), -- established, caution, elevated_risk, high_risk
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_business_id ON verification_activity(business_id);
CREATE INDEX idx_activity_type ON verification_activity(verification_type);
CREATE INDEX idx_activity_date ON verification_activity(created_at);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_profiles ENABLE ROW LEVEL SECURITY;

-- Public can read businesses and risk profiles
CREATE POLICY "Public read businesses" ON businesses FOR SELECT USING (true);
CREATE POLICY "Public read risk profiles" ON risk_profiles FOR SELECT USING (true);

-- Only verified businesses can update themselves
CREATE POLICY "Businesses update own profile" ON businesses FOR UPDATE USING (verified = true);

-- Anyone can submit reports
CREATE POLICY "Public submit reports" ON user_reports FOR INSERT WITH CHECK (true);

-- ============================================================
-- USEFUL VIEWS
-- ============================================================

CREATE OR REPLACE VIEW business_summaries AS
SELECT 
  b.id,
  b.business_name,
  b.website,
  b.verified,
  rp.trust_score,
  rp.risk_level,
  COUNT(DISTINCT ur.id) as report_count,
  COUNT(DISTINCT sa.id) as social_account_count,
  rp.generated_at as last_risk_assessment
FROM businesses b
LEFT JOIN risk_profiles rp ON b.id = rp.business_id
LEFT JOIN user_reports ur ON b.id = ur.business_id
LEFT JOIN social_accounts sa ON b.id = sa.business_id
GROUP BY b.id, b.business_name, b.website, b.verified, rp.trust_score, rp.risk_level, rp.generated_at;

-- Get trending scams
CREATE OR REPLACE VIEW trending_scams AS
SELECT 
  b.business_name,
  COUNT(*) as report_count,
  ARRAY_AGG(DISTINCT ur.report_type) as scam_types,
  MAX(ur.created_at) as latest_report
FROM user_reports ur
LEFT JOIN businesses b ON ur.business_id = b.id
WHERE ur.status = 'pending'
GROUP BY b.business_name
ORDER BY report_count DESC
LIMIT 20;

-- ============================================================
-- DONE
-- ============================================================
-- Run this entire script in Supabase SQL editor
-- Then create API keys and enable necessary functions
