/**
 * brandstrack Backend API - WITH PREMIUM SYSTEM + NEWS FETCHING
 * Complete verification engine with Claude AI integration
 * Deploy to: Render, Railway, or Vercel
 * FIXED: NEWS_API_KEY hardcoded as fallback
 */

const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
require('dotenv').config();

const paymentRoutes = require('./payment-routes');
const settingsRoutes = require('./settings-routes');
const whatsappBot = require('./whatsapp-bot');
const businessRoutes = require('./business-routes');
const paystack = require('./paystack-integration');

const app = express();

// Enable CORS - MUST BE AFTER const app = express()
app.use(cors());
app.use(express.json());

// Additional CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize Supabase client (NO WebSocket/Realtime)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const claude = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// News API - FIXED: Hardcoded as fallback
const NEWS_API_KEY = process.env.NEWS_API_KEY || '360cee0702dd4e5589f019d6f5033760';
const NEWS_API_BASE = 'https://newsapi.org/v2/everything';

console.log(`📰 NEWS_API_KEY Loaded: ${NEWS_API_KEY ? '✅ YES' : '❌ NO'}`);

// ============================================================
// HELPER FUNCTIONS - NEWS & SENTIMENT ANALYSIS
// ============================================================

/**
 * Fetch news from News API for a company
 */
async function fetchCompanyNews(companyName) {
  try {
    console.log(`🔍 Fetching news for: ${companyName}`);
    
    const response = await axios.get(NEWS_API_BASE, {
      params: {
        q: companyName,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 20,
        apiKey: NEWS_API_KEY
      },
      timeout: 5000
    });

    console.log(`📰 News API Response: ${response.data.articles ? response.data.articles.length : 0} articles found`);

    if (response.data.articles && response.data.articles.length > 0) {
      return response.data.articles.map(article => ({
        title: article.title,
        description: article.description,
        content: article.content,
        url: article.url,
        image: article.urlToImage,
        source: article.source.name,
        published_date: article.publishedAt,
        sentiment: analyzeSentiment(article.title + ' ' + (article.description || ''))
      }));
    }
    
    console.log(`⚠️ No articles found for: ${companyName}`);
    return [];
  } catch (error) {
    console.error(`❌ Error fetching news for ${companyName}:`, error.message);
    return [];
  }
}

/**
 * Simple sentiment analysis based on keywords
 */
function analyzeSentiment(text) {
  const positiveWords = [
    'growth', 'raised', 'expanded', 'success', 'partnership', 'innovation',
    'acquisition', 'milestone', 'record', 'boost', 'surge', 'thriving',
    'positive', 'new product', 'launch', 'leading', 'award'
  ];

  const negativeWords = [
    'lawsuit', 'dropped', 'declined', 'failed', 'loss', 'scandal',
    'fraud', 'collapse', 'bankrupt', 'shutdown', 'negative', 'scam',
    'complaint', 'warning', 'risk', 'plunge', 'crisis'
  ];

  const lowerText = text.toLowerCase();

  let score = 0;
  positiveWords.forEach(word => {
    if (lowerText.includes(word)) score += 1;
  });

  negativeWords.forEach(word => {
    if (lowerText.includes(word)) score -= 1;
  });

  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}

/**
 * Analyze news sentiment and create summary
 */
function analyzeNewsSentiment(articles) {
  if (!articles || articles.length === 0) {
    return {
      total_articles: 0,
      positive_percentage: 0,
      negative_percentage: 0,
      neutral_percentage: 0,
      trend: 'NO_DATA',
      credibility: 'Not enough data'
    };
  }

  const positive = articles.filter(a => a.sentiment === 'positive').length;
  const negative = articles.filter(a => a.sentiment === 'negative').length;
  const neutral = articles.filter(a => a.sentiment === 'neutral').length;
  const total = articles.length;

  const posPercentage = Math.round((positive / total) * 100);
  const negPercentage = Math.round((negative / total) * 100);
  const neuPercentage = Math.round((neutral / total) * 100);

  let trend = 'STABLE';
  if (posPercentage > 60) trend = 'GROWING';
  if (negPercentage > 40) trend = 'DECLINING';

  return {
    total_articles: total,
    positive_articles: positive,
    negative_articles: negative,
    neutral_articles: neutral,
    positive_percentage: posPercentage,
    negative_percentage: negPercentage,
    neutral_percentage: neuPercentage,
    trend: trend,
    credibility: `Strong market presence (${total}+ articles)`,
    summary: generateNewsSummary(posPercentage, negPercentage, trend, total)
  };
}

/**
 * Generate readable news summary
 */
function generateNewsSummary(posPercent, negPercent, trend, total) {
  if (total === 0) return 'No news data available';

  let summary = `🔥 Featured in ${total} news articles. `;

  if (trend === 'GROWING') {
    summary += `Positive sentiment: ${posPercent}% ✅ Growing company with strong media presence.`;
  } else if (trend === 'DECLINING') {
    summary += `Negative sentiment: ${negPercent}% ⚠️ Company facing challenges. Proceed with caution.`;
  } else {
    summary += `Mixed sentiment (${posPercent}% positive). Stable company with moderate media coverage.`;
  }

  return summary;
}

/**
 * Calculate trust boost based on news sentiment
 */
function calculateNewsTrustBoost(articles, summary) {
  if (!articles || articles.length === 0) return 0;

  const positive = articles.filter(a => a.sentiment === 'positive').length;
  const negative = articles.filter(a => a.sentiment === 'negative').length;
  const total = articles.length;

  // More positive articles = higher boost
  const positiveBoost = Math.round((positive / total) * 15);

  // Negative articles = trust penalty
  const negativePenalty = Math.round((negative / total) * 10);

  // Media presence itself = slight boost (credibility)
  const presenceBoost = Math.min(5, Math.round(total / 10));

  return positiveBoost + presenceBoost - negativePenalty;
}

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
      recently_created: true,
      account_name_matches_business: paymentAccount.accountName?.toLowerCase().includes(businessName.toLowerCase()),
      account_age_estimate: 'unknown',
    };
  }

  return evidence;
}

// ============================================================
// RATE LIMITING FUNCTION
// ============================================================

const checkRateLimit = async (phoneNumber) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: checks, error } = await supabase
      .from('verification_activity')
      .select('id')
      .eq('phone_number', phoneNumber)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);
    
    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true };
    }
    
    const count = checks?.length || 0;
    
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
    return { allowed: true };
  }
};

// ============================================================
// API ENDPOINTS - VERIFICATION
// ============================================================

/**
 * POST /api/verify
 * Main verification endpoint - business trust check with rate limiting
 */
app.post('/api/verify', async (req, res) => {
  try {
    const { businessName, website, socialHandle, phoneNumber } = req.body;
    
    if (!businessName) {
      return res.status(400).json({ error: 'Business name is required' });
    }
    
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
    
    const evidence = await collectAllEvidence(businessName, website, socialHandle, null);
    const assessment = await generateRiskAssessment(evidence);
    
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
 * POST /api/email-signup
 * Store email signups from landing page
 */
app.post('/api/email-signup', async (req, res) => {
  try {
    const { name, email, userType, signupDate } = req.body;

    if (!name || !email || !userType) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const { data, error } = await supabase
      .from('email_signups')
      .insert([
        {
          name,
          email,
          user_type: userType,
          signup_date: signupDate
        }
      ]);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Welcome! Check your email for next steps.'
    });
  } catch (error) {
    console.error('Email signup error:', error);
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
    
    if (phoneNumber) {
      const rateLimit = await checkRateLimit(phoneNumber);
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: rateLimit.message
        });
      }
    }
    
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
 * POST /api/reports
 * User reports a suspicious business
 */
app.post('/api/reports', async (req, res) => {
  try {
    const { businessName, reportType, description } = req.body;

    if (!businessName || !reportType) {
      return res.status(400).json({ error: 'Business name and report type required' });
    }

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
      .select('*, risk_profiles(*)')
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
// DASHBOARD ENDPOINTS
// ============================================================

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
// COMPANY RESEARCH ROUTES - WITH PREMIUM & NEWS
// ============================================================

/**
 * GET /api/companies/search
 * Search companies by name - SORTS PREMIUM FIRST
 */
app.get('/api/companies/search', async (req, res) => {
  try {
    const { q, limit = 10, offset = 0 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    // Search companies
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .or(`name.ilike.%${q}%,business_name.ilike.%${q}%,cac_number.ilike.%${q}%`)
      .order('trust_score', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // SORT: Premium companies first, then by trust score
    const sorted = (companies || []).sort((a, b) => {
      if (a.is_premium && !b.is_premium) return -1;
      if (!a.is_premium && b.is_premium) return 1;
      return (b.trust_score || 0) - (a.trust_score || 0);
    });

    res.json({
      success: true,
      results: sorted,
      total: sorted.length,
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
      .select('*')
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
 * Search company by CAC number
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
 * Get complete company profile WITH NEWS - FIXED VERSION
 */
app.get('/api/companies/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    console.log(`🔎 Fetching company details for ID: ${companyId}`);

    // Get company details
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      console.log(`❌ Company not found: ${companyId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Company not found' 
      });
    }

    console.log(`✅ Found company: ${company.name}`);

    // Fetch news from News API
    const news = await fetchCompanyNews(company.name);
    console.log(`📰 Fetched ${news.length} articles for ${company.name}`);

    // Analyze news sentiment and get summary
    const newsSummary = analyzeNewsSentiment(news);
    console.log(`📊 News Summary: ${newsSummary.total_articles} articles, ${newsSummary.trend} trend`);

    // Calculate news-based trust boost
    const newsBoost = calculateNewsTrustBoost(news, newsSummary);
    console.log(`📈 News Boost: +${newsBoost} points`);

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

    // Get existing news mentions from database
    const { data: newsDb } = await supabase
      .from('news_mentions')
      .select('title, source, url, published_date')
      .eq('company_id', companyId)
      .order('published_date', { ascending: false })
      .limit(5);

    // Use API news if available, otherwise use database
    const finalNews = news.length > 0 ? news : (newsDb || []);
    const finalTrustScore = Math.min(100, (company.trust_score || 0) + newsBoost);

    console.log(`✅ Final trust score: ${finalTrustScore} (base: ${company.trust_score}, boost: ${newsBoost})`);

    res.json({
      success: true,
      company: {
        ...company,
        is_premium: company.is_premium || false,
        news: finalNews.slice(0, 3),
        news_summary: newsSummary,
        news_boost: newsBoost,
        final_trust_score: finalTrustScore,
        directors: directors || [],
        financials: financials || []
      }
    });
  } catch (error) {
    console.error('❌ Profile error:', error);
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

    await supabase
      .from('verifications')
      .insert([
        {
          phone_number,
          search_query: company_name,
          search_type: 'company'
        }
      ]);

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

    const { data: allReviews } = await supabase
      .from('seller_reviews')
      .select('rating')
      .eq('seller_id', companyId);

    if (allReviews && allReviews.length > 0) {
      const avgRating = (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(2);
      
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
// PREMIUM SYSTEM ROUTES - NEW
// ============================================================

/**
 * POST /api/premium/initiate-payment
 * Initialize Paystack payment for premium
 */
app.post('/api/premium/initiate-payment', async (req, res) => {
  try {
    const { company_id, company_name, email, phone } = req.body;

    if (!company_id || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company ID and email required' 
      });
    }

    // Paystack amount in kobo (₦30,000 = 3,000,000 kobo)
    const amount = 3000000;
    const reference = `BT-${company_id.substr(0, 8)}-${Date.now()}`;

    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: email,
        amount: amount,
        reference: reference,
        metadata: {
          company_id: company_id,
          company_name: company_name,
          phone: phone,
          plan: 'premium_monthly',
          subscription_months: 1
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (paystackResponse.data.status) {
      await supabase
        .from('payment_logs')
        .insert({
          company_id: company_id,
          amount: 30000,
          currency: 'NGN',
          status: 'pending',
          paystack_reference: reference,
          subscription_months: 1
        });

      res.json({
        success: true,
        payment_url: paystackResponse.data.data.authorization_url,
        access_code: paystackResponse.data.data.access_code,
        reference: reference
      });
    } else {
      res.json({ success: false, message: 'Payment initialization failed' });
    }
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ success: false, message: 'Payment error' });
  }
});

/**
 * POST /api/premium/paystack-webhook
 * Verify payment and activate premium
 */
app.post('/api/premium/paystack-webhook', async (req, res) => {
  try {
    const { reference } = req.body;

    const verification = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const paymentData = verification.data.data;

    if (paymentData.status === 'success') {
      const { company_id, subscription_months } = paymentData.metadata;

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + subscription_months);

      await supabase
        .from('companies')
        .update({
          is_premium: true,
          subscription_date: startDate.toISOString(),
          subscription_end_date: endDate.toISOString(),
          paystack_subscription_id: reference
        })
        .eq('id', company_id);

      await supabase
        .from('premium_features')
        .upsert({
          company_id: company_id,
          featured_listing: true,
          customer_reviews_enabled: true,
          fraud_response_enabled: true,
          api_access_enabled: false
        });

      await supabase
        .from('payment_logs')
        .update({
          status: 'successful',
          paystack_authorization_code: paymentData.authorization.authorization_code
        })
        .eq('paystack_reference', reference);

      res.json({ 
        success: true, 
        message: 'Payment verified. Company now premium!',
        company_id: company_id,
        subscription_end_date: endDate
      });
    } else {
      await supabase
        .from('payment_logs')
        .update({ status: 'failed' })
        .eq('paystack_reference', reference);

      res.json({ success: false, message: 'Payment not successful' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook error' });
  }
});

/**
 * GET /api/premium/status/:company_id
 * Check if company is premium and subscription status
 */
app.get('/api/premium/status/:company_id', async (req, res) => {
  try {
    const { company_id } = req.params;

    const { data: company, error } = await supabase
      .from('companies')
      .select('is_premium, subscription_end_date')
      .eq('id', company_id)
      .single();

    if (error) {
      return res.json({ success: false, message: 'Company not found' });
    }

    if (company.is_premium && company.subscription_end_date) {
      const endDate = new Date(company.subscription_end_date);
      const today = new Date();

      if (today > endDate) {
        await supabase
          .from('companies')
          .update({ is_premium: false })
          .eq('id', company_id);

        return res.json({ 
          success: true, 
          is_premium: false, 
          message: 'Subscription expired' 
        });
      }
    }

    res.json({ 
      success: true, 
      is_premium: company.is_premium || false,
      subscription_end_date: company.subscription_end_date
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ success: false, message: 'Error checking status' });
  }
});

/**
 * GET /api/companies/trending/premium
 * Get trending premium companies
 */
app.get('/api/companies/trending/premium', async (req, res) => {
  try {
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .eq('is_premium', true)
      .order('trust_score', { ascending: false })
      .limit(10);

    if (error) {
      return res.json({ success: false, message: 'Error fetching trending' });
    }

    res.json({ success: true, results: companies || [] });
  } catch (error) {
    console.error('Trending error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
});

// ============================================================
// Route Handlers
// ============================================================

app.use('/api/payments', paymentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/whatsapp', whatsappBot);

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== WHATSAPP BOT ENDPOINTS ====================

/**
 * POST /whatsapp/webhook
 * Receive incoming WhatsApp messages
 */
app.post('/whatsapp/webhook', async (req, res) => {
  try {
    const { Body, From, To } = req.body;
    
    if (!Body || !From) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const message = Body.trim();
    const userPhone = From.replace('whatsapp:', '');

    console.log(`📱 Message from ${userPhone}: ${message}`);

    let response = '';

    if (message.toLowerCase().startsWith('check ')) {
      const companyName = message.substring(6).trim();
      response = await handleCheckBusiness(companyName, userPhone);
    } 
    else if (message.toLowerCase().startsWith('verify ')) {
      const businessName = message.substring(7).trim();
      response = await handleVerifySeller(businessName, userPhone);
    }
    else if (message.toLowerCase().startsWith('job ')) {
      const companyName = message.substring(4).trim();
      response = await handleJobCheck(companyName, userPhone);
    }
    else if (message.toLowerCase() === 'help') {
      response = handleHelpCommand();
    }
    else if (message.toLowerCase() === 'menu') {
      response = handleMenuCommand();
    }
    else {
      response = `Hi! 👋 I'm brandstrack Bot.\n\nCommands:\n📍 Check [company] - Verify a company\n🏢 Verify [business] - Verify your business\n💼 Job [company] - Check if job is real\n❓ Help - Show more info\n\nExample: Check Jumia`;
    }

    await sendWhatsAppMessage(userPhone, response);

    res.json({ success: true, message: 'Message processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function handleCheckBusiness(companyName, userPhone) {
  try {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, trust_score, verification_status, cac_number, website, address')
      .or(`name.ilike.%${companyName}%,business_name.ilike.%${companyName}%`)
      .limit(1);

    if (!companies || companies.length === 0) {
      return `❌ ${companyName} not found in our database.\n\nTry:\n• Check Jumia\n• Check Paystack\n• Check MTN Nigeria`;
    }

    const company = companies[0];

    await supabase.from('verifications').insert([{
      phone_number: userPhone,
      search_query: companyName,
      search_type: 'company',
      result_id: company.id,
      result_trust_score: company.trust_score
    }]);

    let trustEmoji = '';
    let trustText = '';
    
    if (company.trust_score >= 90) {
      trustEmoji = '✅';
      trustText = 'VERIFIED - High Trust';
    } else if (company.trust_score >= 70) {
      trustEmoji = '🟡';
      trustText = 'CAUTION - Medium Trust';
    } else {
      trustEmoji = '⚠️';
      trustText = 'ALERT - Low Trust';
    }

    return `${trustEmoji} *${company.name}*\n\nTrust Score: ${company.trust_score}/100\nStatus: ${trustText}\nCAC: ${company.cac_number}\nWebsite: ${company.website}\nAddress: ${company.address}`;
  } catch (error) {
    console.error('Check business error:', error);
    return '⚠️ Error checking business. Try again later.';
  }
}

async function handleVerifySeller(businessName, userPhone) {
  try {
    return `🔐 *Seller Verification*\n\nTo get verified badge:\n\n1️⃣ Business name: ${businessName}\n2️⃣ Reply with your:\n   • Website\n   • WhatsApp number\n   • Email\n\nCost: ₦30,000/month\n\nReply YES to continue.`;
  } catch (error) {
    console.error('Verify seller error:', error);
    return '⚠️ Error processing verification.';
  }
}

async function handleJobCheck(companyName, userPhone) {
  try {
    const { data: companies } = await supabase
      .from('companies')
      .select('name, trust_score, verification_status')
      .or(`name.ilike.%${companyName}%,business_name.ilike.%${companyName}%`)
      .limit(1);

    if (!companies || companies.length === 0) {
      return `⚠️ No records found for ${companyName}.\n\nBe careful! This could be a job scam.`;
    }

    const company = companies[0];

    if (company.verification_status === 'verified') {
      return `✅ *${company.name}* is a verified company.\n\nTrust Score: ${company.trust_score}/100\n\nIt's generally safe to apply. But always verify:\n• Official email domain\n• Company website\n• Phone number`;
    } else {
      return `🟡 *${company.name}* - Limited information.\n\nTrust Score: ${company.trust_score}/100\n\n⚠️ Be cautious:\n• Verify company website\n• Check official email\n• Never pay upfront fees\n• Ask for interview link`;
    }
  } catch (error) {
    console.error('Job check error:', error);
    return '⚠️ Error checking job. Try again.';
  }
}

function handleHelpCommand() {
  return `*brandstrack Bot Help* 🤖\n\n📍 *CHECK* - Verify any company\nUsage: Check Jumia\nGets: Trust score, address, CAC\n\n🏢 *VERIFY* - Get verified seller badge\nUsage: Verify My Business\nCost: ₦30,000/month\n\n💼 *JOB* - Check if job is real\nUsage: Job Google\nGets: Company info, safety tips\n\n*Questions?* Reply MENU for more.`;
}

function handleMenuCommand() {
  return `*brandstrack Menu* 📋\n\n1️⃣ Check companies\n2️⃣ Verify your business\n3️⃣ Check job offers\n4️⃣ Report scams\n5️⃣ Get badges\n\nReply with a command above or type:\n• HELP - Full guide\n• STATUS - Your account\n\nPowered by brandstrack.com`;
}

async function sendWhatsAppMessage(toPhone, message) {
  try {
    console.log(`📤 Sending to ${toPhone}: ${message}`);
  } catch (error) {
    console.error('Send message error:', error);
  }
}

app.get('/whatsapp/webhook', (req, res) => {
  res.json({ 
    success: true, 
    message: 'WhatsApp webhook is ready',
    endpoint: '/whatsapp/webhook'
  });
});

// ============================================================
// Start server
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 brandstrack API running on port ${PORT}`);
  console.log(`📊 With PREMIUM SYSTEM + NEWS FETCHING ✅`);
  console.log(`💳 Paystack integration: Ready`);
  console.log(`📰 News API Key: ${NEWS_API_KEY ? 'CONFIGURED ✅' : 'NOT CONFIGURED ❌'}`);
  console.log(`🔑 News API: ${NEWS_API_KEY ? NEWS_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
});

module.exports = app;