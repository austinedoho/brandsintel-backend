// ========================================
// BrandsTrack Backend - FINAL VERSION
// Deployed to: https://brandsintel-backend.onrender.com
// Last Updated: August 30, 2026
// ========================================

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.fskwsvrlomlmuvkclcqo:Real%2Fbrandstrack-man1984@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'
});

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/health',
      'GET /api/companies/search?q=QUERY',
      'POST /api/reports/generate',
      'GET /api/settings/public'
    ]
  });
});

// ========================================
// COMPANY SEARCH ENDPOINT
// Path: /api/companies/search?q=QUERY
// Method: GET
// Returns: {results: [{name, cac_number, industry, status, trust_score}]}
// ========================================
app.get('/api/companies/search', async (req, res) => {
  try {
    const query = req.query.q?.toLowerCase() || '';
    
    if (!query || query.length < 2) {
      return res.json({ results: [] });
    }

    // Mock data for demo (replace with DB query)
    const mockCompanies = [
      {
        id: 1,
        name: 'Jumia Nigeria',
        cac_number: '123456',
        industry: 'E-Commerce',
        status: 'Active',
        trust_score: 98,
        employees: 5000,
        founded: '2012',
        website: 'jumia.com.ng'
      },
      {
        id: 2,
        name: 'MTN Nigeria',
        cac_number: '654321',
        industry: 'Telecommunications',
        status: 'Active',
        trust_score: 95,
        employees: 8000,
        founded: '2001',
        website: 'mtn.com.ng'
      },
      {
        id: 3,
        name: 'BrandsTrack Nigeria',
        cac_number: '9736925',
        industry: 'Technology/SaaS',
        status: 'Active',
        trust_score: 85,
        employees: 25,
        founded: '2024',
        website: 'brandstrack.com'
      }
    ];

    // Filter by search query
    const results = mockCompanies.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.cac_number.includes(query)
    );

    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ========================================
// GENERATE REPORT ENDPOINT
// Path: /api/reports/generate
// Method: POST
// Body: {email, amount, currency}
// Returns: Paystack auth URL
// ========================================
app.post('/api/reports/generate', async (req, res) => {
  try {
    const { email, amount = 350000 } = req.body; // 3,500 naira = 350,000 kobo

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Paystack payment initialization
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || 'sk_live_e68e95f7aaf1953b57182098ecbd554ab0a7eef0';
    const reference = `BT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount,
        reference,
        callback_url: 'https://www.brandstrack.com/trust-reports.html'
      })
    });

    const data = await response.json();

    if (data.status) {
      res.json({
        success: true,
        authorization_url: data.data.authorization_url,
        reference
      });
    } else {
      res.status(400).json({ error: 'Paystack error' });
    }
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// ========================================
// PUBLIC SETTINGS ENDPOINT
// Path: /api/settings/public
// Method: GET
// Returns: {premium_monthly_price, free_searches_per_day}
// ========================================
app.get('/api/settings/public', (req, res) => {
  res.json({
    premium_monthly_price: 30000, // ₦30,000
    free_searches_per_day: 3,
    articles_per_company: 9,
    currency: 'NGN'
  });
});

// ========================================
// FALLBACK ENDPOINT (for backwards compatibility)
// Path: /api/v1/companies/search?q=QUERY
// Redirects to: /api/companies/search
// ========================================
app.get('/api/v1/companies/search', async (req, res) => {
  // Forward to main search endpoint
  req.url = '/api/companies/search';
  app.handle(req, res);
});

// ========================================
// 404 HANDLER
// ========================================
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: 'Use one of: /api/health, /api/companies/search?q=QUERY, /api/reports/generate, /api/settings/public'
  });
});

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ BrandsTrack Backend Running on port ${PORT}`);
  console.log(`📍 Endpoints:`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/companies/search?q=QUERY`);
  console.log(`   POST /api/reports/generate`);
  console.log(`   GET  /api/settings/public`);
  console.log(`   GET  /api/v1/companies/search?q=QUERY (alias)`);
});

module.exports = app;
