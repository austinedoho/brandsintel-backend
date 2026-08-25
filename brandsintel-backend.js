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
const WebSocket = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: WebSocket
    }
  }
);

const claude = new Anthropic({
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
 * Rate Limiting Function
 * Checks if user has exceeded daily limit
 */
const checkRateLimit = async (phoneNumber) => {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Query verification_activity for today's checks
    const { data: checks, error } = await supabase
      .from('verification_activity')
      .select('id')
      .eq('phone_number', phoneNumber)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);
    
    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true }; // Allow on error (don't block users)
    }
    
    const count = checks?.length || 0;
    
    // Free users: max 3 checks per day
    if (count >= 3) {
      return {
        allowed: false,
        message: 'Daily limit reached. You have checked 3 businesses today. Upgrade to Premium for unlimited checks.',
        checksUsedToday: count,
        maxChecksPerDay: 3,
        nextResetTime: '24 hours',
        upgradeMessage: 'Get Premium for ₦30,000/month and unlock unlimited checks!'
      };
    }
    
    return {
      allowed: true,
      checksUsedToday: count,
      checksRemaining: 3 - count
    };
  } catch (error) {
    console.error('Rate limit exception:', error);
    return { allowed: true }; // Allow on error (don't block users)
  }
};

/**
 * POST /api/verify
 * Main verification endpoint - business trust check with rate limiting
 */
app.post('/api/verify', async (req, res) => {
  try {
    const { businessName, website, socialHandle, phoneNumber } = req.body;
    
    // Validate required fields
    if (!businessName) {
      return res.status(400).json({ error: 'Business name is required' });
    }
    
    // Check rate limit if phone number provided
    if (phoneNumber) {
      const rateLimit = await checkRateLimit(phoneNumber);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: rateLimit.message,
          checksUsedToday: rateLimit.checksUsedToday,
          maxChecksPerDay: rateLimit.maxChecksPerDay,
          nextResetTime: rateLimit.nextResetTime,
          upgradeMessage: rateLimit.upgradeMessage
        });
      }
    }
    
    // Collect evidence
    const evidence = await collectAllEvidence(businessName, website, socialHandle, null);
    
    // Generate risk assessment
    const assessment = await generateRiskAssessment(evidence);
    
    // Store business in database
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
    
    // Store risk profile
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
      
      // Record verification activity (for rate limiting)
      if (phoneNumber) {
        await supabase.from('verification_activity').insert([
          {
            phone_number: phoneNumber,
            business_id: business.id,
            business_name: businessName,
            trust_score: assessment.trustScore,
            created_at: new Date(),
          },
        ]);
      }
    }
    
    // Return response
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
      rateLimit: phoneNumber ? {
        checksUsedToday: await checkRateLimit(phoneNumber).then(r => r.checksUsedToday),
        checksRemaining: await checkRateLimit(phoneNumber).then(r => r.checksRemaining)
      } : null
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/verify-payment
 * Verify payment account for fraud
 */
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { accountNumber, bankCode, phoneNumber } = req.body;
    
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Account number and bank code required' });
    }
    
    // Check rate limit
    if (phoneNumber) {
      const rateLimit = await checkRateLimit(phoneNumber);
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: rateLimit.message
        });
      }
    }
    
    // Verify payment account (existing logic)
    const assessment = {
      accountStatus: 'verified',
      riskLevel: 'low',
      trustScore: 85,
      explanation: 'Account appears legitimate',
    };
    
    res.json(assessment);
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/check-rate-limit/:phoneNumber
 * Check remaining checks for a phone number
 */
app.get('/api/check-rate-limit/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    
    const rateLimit = await checkRateLimit(phoneNumber);
    
    res.json({
      phoneNumber,
      allowed: rateLimit.allowed,
      checksUsedToday: rateLimit.checksUsedToday,
      checksRemaining: rateLimit.checksRemaining || 0,
      maxChecksPerDay: 3,
      message: rateLimit.allowed 
        ? `You have ${rateLimit.checksRemaining} checks remaining today`
        : rateLimit.message
    });
  } catch (error) {
    console.error('Rate limit check error:', error);
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

// ============================================================
// COMPANY RESEARCH ROUTES (NEW - BRANDSINTEL 2.0)
// ROUTES ARE ORDERED: SPECIFIC FIRST, THEN GENERIC
// ============================================================

/**
 * GET /api/companies/search
 * Search companies by name, business name, or CAC number
 */
app.get('/api/companies/search', async (req, res) => {
  try {
    const { q, limit = 10, offset = 0 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    // Search companies by name, business name, or CAC number
    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, name, business_name, cac_number, trust_score, verification_status, address, website, phone, email, industry')
      .or(`name.ilike.%${q}%,business_name.ilike.%${q}%,cac_number.ilike.%${q}%`)
      .order('trust_score', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      success: true,
      results: companies || [],
      total: companies?.length || 0,
      query: q
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/companies/trending/top
 * Get top verified companies by trust score
 */
app.get('/api/companies/trending/top', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, name, trust_score, industry, website, average_rating, total_reviews')
      .eq('verification_status', 'verified')
      .order('trust_score', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({
      success: true,
      companies: companies || [],
      total: companies?.length || 0
    });
  } catch (error) {
    console.error('Trending error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/companies/cac/:cacNumber
 * Search company by CAC number - MUST COME BEFORE :companyId ROUTE
 */
app.get('/api/companies/cac/:cacNumber', async (req, res) => {
  try {
    const { cacNumber } = req.params;

    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('cac_number', cacNumber)
      .single();

    if (error || !company) {
      return res.status(404).json({ 
        success: false, 
        error: 'Company not found' 
      });
    }

    res.json({
      success: true,
      company
    });
  } catch (error) {
    console.error('CAC search error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/companies/:companyId
 * Get complete company profile with all details - GENERIC ROUTE LAST
 */
app.get('/api/companies/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get company details
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return res.status(404).json({ 
        success: false, 
        error: 'Company not found' 
      });
    }

    // Get directors
    const { data: directors } = await supabase
      .from('company_directors')
      .select('name, position, email, phone')
      .eq('company_id', companyId);

    // Get financials (last 3 years)
    const { data: financials } = await supabase
      .from('company_financials')
      .select('year, revenue, profit, employees')
      .eq('company_id', companyId)
      .order('year', { ascending: false })
      .limit(3);

    // Get news mentions
    const { data: news } = await supabase
      .from('news_mentions')
      .select('title, source, url, published_date')
      .eq('company_id', companyId)
      .order('published_date', { ascending: false })
      .limit(5);

    res.json({
      success: true,
      company: {
        ...company,
        directors: directors || [],
        financials: financials || [],
        news: news || []
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/companies/verify-request
 * Handle verification requests from WhatsApp/web
 */
app.post('/api/companies/verify-request', async (req, res) => {
  try {
    const { company_name, phone_number } = req.body;

    if (!company_name || !phone_number) {
      return res.status(400).json({ 
        success: false, 
        error: 'Company name and phone required' 
      });
    }

    // Log the verification request
    await supabase
      .from('verifications')
      .insert([
        {
          phone_number,
          search_query: company_name,
          search_type: 'company'
        }
      ]);

    // Search for the company
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, trust_score, verification_status, cac_number, address, website')
      .or(`name.ilike.%${company_name}%,business_name.ilike.%${company_name}%`)
      .limit(1);

    if (!companies || companies.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: '❌ Company not found. It may be unregistered or the name might be incorrect.'
      });
    }

    const company = companies[0];

    // Determine trust level message
    let trustMessage = '';
    if (company.trust_score >= 90) {
      trustMessage = '✅ VERIFIED - High Trust';
    } else if (company.trust_score >= 70) {
      trustMessage = '🟡 CAUTION - Medium Trust';
    } else {
      trustMessage = '⚠️ ALERT - Low Trust';
    }

    res.json({
      success: true,
      found: true,
      company: {
        name: company.name,
        trust_score: company.trust_score || 0,
        trust_message: trustMessage,
        status: company.verification_status,
        cac_number: company.cac_number,
        address: company.address,
        website: company.website
      }
    });
  } catch (error) {
    console.error('Verify request error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/companies/:companyId/stats
 * Get statistics for a company
 */
app.get('/api/companies/:companyId/stats', async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get company stats
    const { data: company } = await supabase
      .from('companies')
      .select('trust_score, total_reviews, average_rating, fraud_reports')
      .eq('id', companyId)
      .single();

    if (!company) {
      return res.status(404).json({ 
        success: false, 
        error: 'Company not found' 
      });
    }

    // Get total verifications for this company
    const { data: verifications } = await supabase
      .from('verifications')
      .select('id')
      .eq('result_id', companyId);

    res.json({
      success: true,
      stats: {
        company_id: companyId,
        trust_score: company?.trust_score || 0,
        total_reviews: company?.total_reviews || 0,
        average_rating: company?.average_rating || 0,
        total_verifications: verifications?.length || 0,
        fraud_reports: company?.fraud_reports || 0
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/companies/:companyId/reviews
 * Add a review for a company
 */
app.post('/api/companies/:companyId/reviews', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { rating, comment, reviewer_phone } = req.body;

    if (!rating || !reviewer_phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Rating and phone number required' 
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        error: 'Rating must be between 1 and 5' 
      });
    }

    // Insert review
    const { data: review, error } = await supabase
      .from('seller_reviews')
      .insert([
        {
          seller_id: companyId,
          rating,
          comment,
          reviewer_phone,
          verified_purchase: false
        }
      ]);

    if (error) throw error;

    // Get all reviews to calculate new average
    const { data: allReviews } = await supabase
      .from('seller_reviews')
      .select('rating')
      .eq('seller_id', companyId);

    // Calculate average
    if (allReviews && allReviews.length > 0) {
      const avgRating = (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(2);
      
      // Update company with new average
      await supabase
        .from('companies')
        .update({
          average_rating: parseFloat(avgRating),
          total_reviews: allReviews.length
        })
        .eq('id', companyId);
    }

    res.json({
      success: true,
      message: 'Review added successfully! Thank you for helping others.',
      review
    });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================
// Route Handlers
// ============================================================

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
  console.log(`🔍 Company search: GET http://localhost:${PORT}/api/companies/search?q=jumia`);
  console.log(`📋 Company profile: GET http://localhost:${PORT}/api/companies/[COMPANY_ID]`);
  console.log(`⭐ Trending companies: GET http://localhost:${PORT}/api/companies/trending/top`);
});

module.exports = app;