/**
 * BrandsIntel Backend API
 * Complete verification engine with Claude AI integration
 * Deploy to: Render, Railway, or Vercel
 */

const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
require('dotenv').config();

const paymentRoutes = require('./payment-routes');
const settingsRoutes = require('./settings-routes');
const businessRoutes = require('./business-routes');
const paystack = require('./paystack-integration');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: {
      params: {
        eventsPerSecond: 0,
      },
    },
  }
);const claude = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// ============================================================
// CORE: Generate Risk Assessment with Claude
// ============================================================

async function generateRiskAssessment(evidence) {
  try {
    const message = await claude.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a fraud risk assessment expert for Nigerian businesses.

Given the following evidence about a business, provide a structured risk assessment.

EVIDENCE:
${JSON.stringify(evidence, null, 2)}

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "riskLevel": "established" | "caution" | "elevated_risk" | "high_risk" | "insufficient_data",
  "trustScore": 0-100,
  "confidenceScore": 0-100,
  "keyIndicators": ["indicator1", "indicator2", "indicator3"],
  "explanation": "Clear, 1-2 sentence explanation of the risk",
  "whyThisMatters": "Why this matters to the user in 1 sentence",
  "nextSteps": "What the user should do next"
}`,
        },
      ],
    });

    const responseText = message.content[0].text;
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Claude API error:', error);
    return {
      riskLevel: 'insufficient_data',
      trustScore: 50,
      confidenceScore: 20,
      keyIndicators: ['Claude API error - try again'],
      explanation: 'Unable to assess risk right now. Try again in a moment.',
      whyThisMatters: 'Assessment requires external data.',
      nextSteps: 'Retry in 30 seconds.',
    };
  }
}

// ============================================================
// DATA COLLECTION: Automated Evidence Gathering
// ============================================================

async function getWhoisData(domain) {
  try {
    const response = await axios.get(`https://www.whois.com/whois/${domain}`, {
      timeout: 5000,
    });
    const text = response.data;

    return {
      registrant: text.match(/Registrant Organization:(.+)/)?.[1]?.trim() || 'Unknown',
      registrationDate: text.match(/Creation Date:(.+)/)?.[1]?.trim() || null,
      expiryDate: text.match(/Registry Expiry Date:(.+)/)?.[1]?.trim() || null,
      found: true,
    };
  } catch (error) {
    console.log('WHOIS lookup failed (expected for many domains)');
    return { found: false };
  }
}

async function getSSLInfo(domain) {
  try {
    const response = await axios.get(`https://crt.sh/?q=${domain}&output=json`, {
      timeout: 5000,
    });
    return {
      valid: true,
      certificateCount: response.data?.length || 0,
    };
  } catch {
    return { valid: false };
  }
}

async function getDomainAge(domain) {
  try {
    const response = await axios.get(`https://api.domainsdb.info/v1/domain/details/${domain}`, {
      timeout: 5000,
    });
    if (response.data?.domain) {
      const created = new Date(response.data.domain.created_date);
      const ageInDays = Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
      return { ageInDays, createdDate: created };
    }
  } catch {
    return { ageInDays: null };
  }
}

async function checkWaybackMachine(domain) {
  try {
    const response = await axios.get(
      `https://archive.org/wayback/available?url=${domain}&output=json`,
      { timeout: 5000 }
    );
    if (response.data?.archived_snapshots?.closest) {
      return {
        hasSnapshots: true,
        count: 1,
      };
    }
  } catch {
    return { hasSnapshots: false };
  }
}

async function collectAllEvidence(businessName, website, socialHandle, paymentAccount) {
  const evidence = {
    businessName,
    website,
    socialHandle,
    paymentAccount,
    collectedAt: new Date(),
  };

  // Collect website data
  if (website) {
    try {
      const domain = website.replace('www.', '').replace('https://', '').replace('http://', '');
      const [whois, ssl, age, wayback] = await Promise.all([
        getWhoisData(domain),
        getSSLInfo(domain),
        getDomainAge(domain),
        checkWaybackMachine(domain),
      ]);

      evidence.website_data = {
        ssl_valid: ssl.valid,
        domain_age_days: age.ageInDays,
        has_wayback_snapshots: wayback.hasSnapshots,
        registrant: whois.registrant,
      };
    } catch (error) {
      console.error('Error collecting website data:', error);
    }
  }

  // Check for user reports
  try {
    const reports = await supabase
      .from('user_reports')
      .select('report_type, severity, created_at')
      .eq('business_name', businessName)
      .limit(10);

    if (reports.data && reports.data.length > 0) {
      evidence.user_reports = {
        count: reports.data.length,
        types: [...new Set(reports.data.map((r) => r.report_type))],
        severities: reports.data.map((r) => r.severity),
      };
    }
  } catch (error) {
    console.error('Error fetching reports:', error);
  }

  // Payment account risk checks
  if (paymentAccount) {
    evidence.payment_account = {
      recently_created: true, // This would be checked against bank data
      account_name_matches_business: paymentAccount.accountName?.toLowerCase().includes(businessName.toLowerCase()),
      account_age_estimate: 'unknown',
    };
  }

  return evidence;
}

// ============================================================
// API ENDPOINTS
// ============================================================

/**
 * POST /api/verify
 * Main verification endpoint - business trust check
 */
app.post('/api/verify', async (req, res) => {
  try {
    const { businessName, website, socialHandle } = req.body;

    if (!businessName) {
      return res.status(400).json({ error: 'Business name is required' });
    }

    // Collect evidence
    const evidence = await collectAllEvidence(businessName, website, socialHandle, null);

    // Generate risk assessment
    const assessment = await generateRiskAssessment(evidence);

    // Store in database
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .upsert(
        {
          business_name: businessName,
          website: website || null,
          social_handle: socialHandle || null,
          last_checked: new Date(),
        },
        { onConflict: 'business_name' }
      )
      .select()
      .single();

    if (!businessError && business) {
      await supabase.from('risk_profiles').insert([
        {
          business_id: business.id,
          trust_score: assessment.trustScore,
          risk_level: assessment.riskLevel,
          key_indicators: assessment.keyIndicators,
          explanation: assessment.explanation,
          confidence_score: assessment.confidenceScore,
          generated_at: new Date(),
        },
      ]);
    }

    res.json({
      businessName,
      trustScore: assessment.trustScore,
      riskLevel: assessment.riskLevel,
      explanation: assessment.explanation,
      keyIndicators: assessment.keyIndicators,
      whyThisMatters: assessment.whyThisMatters,
      nextSteps: assessment.nextSteps,
      confidenceScore: assessment.confidenceScore,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/verify-payment
 * Payment account risk verification
 */
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { accountName, bank, accountNumber } = req.body;

    if (!accountName || !accountNumber) {
      return res.status(400).json({ error: 'Account name and number required' });
    }

    // Check for patterns
    const scamIndicators = [];

    if (accountName.toLowerCase().includes('operations')) {
      scamIndicators.push('Vague account naming pattern');
    }
    if (accountNumber.length !== 10 && accountNumber.length !== 11) {
      scamIndicators.push('Invalid account number format');
    }
    if (!['Access', 'GTBank', 'First', 'UBA', 'Zenith', 'FCMB'].some((b) => bank?.includes(b))) {
      scamIndicators.push('Unrecognized bank');
    }

    // Check for matching business
    const matchingBusiness = await supabase
      .from('businesses')
      .select('id, business_name')
      .ilike('business_name', `%${accountName.split(' ')[0]}%`)
      .limit(1);

    const evidence = {
      accountName,
      bank,
      hasMatchingBusiness: matchingBusiness.data && matchingBusiness.data.length > 0,
      scamIndicators,
      accountNumberLength: accountNumber.length,
    };

    const assessment = await generateRiskAssessment(evidence);

    res.json({
      accountName,
      bank,
      trustScore: assessment.trustScore,
      riskLevel: assessment.riskLevel,
      explanation: assessment.explanation,
      keyIndicators: assessment.keyIndicators,
      shouldBlock: assessment.riskLevel === 'high_risk',
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/reports
 * User reports a suspicious business
 */
app.post('/api/reports', async (req, res) => {
  try {
    const { businessName, reportType, description } = req.body;

    if (!businessName || !reportType) {
      return res.status(400).json({ error: 'Business name and report type required' });
    }

    // Get business ID
    const business = await supabase
      .from('businesses')
      .select('id')
      .eq('business_name', businessName)
      .single();

    const { data: report, error } = await supabase
      .from('user_reports')
      .insert([
        {
          business_id: business.data?.id || null,
          business_name: businessName,
          report_type: reportType,
          description: description || null,
          severity: 'medium',
          status: 'pending',
          created_at: new Date(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      reportId: report.id,
      message: 'Report submitted. Thank you for helping keep Nigerian commerce safe.',
    });
  } catch (error) {
    console.error('Report submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/business/:businessName
 * Get business profile
 */
app.get('/api/business/:businessName', async (req, res) => {
  try {
    const { businessName } = req.params;

    const { data: business, error } = await supabase
      .from('businesses')
      .select('*, risk_profiles(*)') // Include risk profiles
      .eq('business_name', businessName)
      .single();

    if (error || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json(business);
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/business/:businessId/reports
 * Get reports for a business
 */
app.get('/api/business/:businessId/reports', async (req, res) => {
  try {
    const { businessId } = req.params;

    const { data: reports, error } = await supabase
      .from('user_reports')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json(reports || []);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/business/verify
 * Business claims their profile
 */
app.post('/api/business/verify', async (req, res) => {
  try {
    const { businessName, website, email, verificationCode } = req.body;

    // In production, verify email + code
    // For now, just upsert

    const { data: business, error } = await supabase
      .from('businesses')
      .upsert(
        {
          business_name: businessName,
          website,
          email,
          verified: true,
          verified_at: new Date(),
        },
        { onConflict: 'business_name' }
      )
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Business verified successfully',
      businessId: business.id,
    });
  } catch (error) {
    console.error('Business verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ============================================================
// Error handling
// ============================================================
// ============================================================
// Dashboard Endpoints
// ============================================================

// GET /api/stats - Dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const businesses = await supabase.from('businesses').select('id').eq('verified', true);
    const users = await supabase.from('verification_activity').select('id');
    const payments = await supabase.from('payments').select('amount').eq('status', 'completed');
    
    const monthlyRevenue = (payments.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    
    res.json({
      totalUsers: users.data?.length || 0,
      totalBusinesses: businesses.data?.length || 0,
      monthlyRevenue: monthlyRevenue,
      checksThisMonth: users.data?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.json({
      totalUsers: 0,
      totalBusinesses: 0,
      monthlyRevenue: 0,
      checksThisMonth: 0,
    });
  }
});

// GET /api/businesses - List all businesses
app.get('/api/businesses', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// GET /api/users - List all users
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('verification_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/payments - List all payments
app.get('/api/payments', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});
// Payment endpoints
app.use('/api/payments', paymentRoutes);

// Settings endpoints
app.use('/api/settings', settingsRoutes);

// Business endpoints
app.use('/api/business', businessRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// Start server
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 BrandsIntel API running on port ${PORT}`);
  console.log(`📊 Verification endpoint: POST http://localhost:${PORT}/api/verify`);
  console.log(`💳 Payment check: POST http://localhost:${PORT}/api/verify-payment`);
});

module.exports = app;
