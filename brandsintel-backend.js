// ============================================================================
// BRANDSTRACK v5.0 - ENTERPRISE FRAUD INTELLIGENCE PLATFORM
// Backend Server (Node.js + Express)
// NEO4J IS OPTIONAL - Server runs without it
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const cron = require('node-cron');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');

// ============================================================================
// CONFIGURATION
// ============================================================================

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Database connections
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

let neo4jDriver = null;
let neo4jConnected = false;

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next()
});

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

app.get('/health', async (req, res) => {
  try {
    // Test PostgreSQL
    const pgResult = await pgPool.query('SELECT NOW()');
    const pgStatus = pgResult.rows[0] ? 'connected' : 'error';

    res.json({
      status: 'ok',
      version: '5.0',
      environment: NODE_ENV,
      timestamp: new Date().toISOString(),
      databases: {
        postgresql: pgStatus,
        neo4j: neo4jConnected ? 'connected' : 'disconnected'
      },
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      version: '5.0',
      error: error.message
    });
  }
});

// ============================================================================
// PHASE 1: B2C TRUST REPORTS
// ============================================================================

// Endpoint: Generate PDF Trust Report
app.post('/api/v1/reports/generate', async (req, res) => {
  try {
    const { rc_number, email } = req.body;

    if (!rc_number || !email) {
      return res.status(400).json({ error: 'rc_number and email required' });
    }

    // 1. Get company from cache
    const companyResult = await pgPool.query(
      'SELECT * FROM company_cache WHERE rc_number = $1',
      [rc_number]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];

    // 2. Get trust score
    const scoreResult = await pgPool.query(
      'SELECT * FROM trust_scores WHERE rc_number = $1',
      [rc_number]
    );

    const trustScore = scoreResult.rows[0] || { overall_score: 75, risk_level: 'medium' };

    // 3. Create report record
    const reportResult = await pgPool.query(
      `INSERT INTO reports (company_id, rc_number, report_type, user_email, payment_status, price_naira, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, price_naira`,
      [company.id, rc_number, 'trust_report', email, 'pending', 3500]
    );

    const report = reportResult.rows[0];

    // 4. Create Paystack payment link
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: email,
        amount: report.price_naira * 100, // Convert to kobo
        metadata: {
          report_id: report.id,
          rc_number: rc_number,
          company_name: company.company_name
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    res.json({
      success: true,
      report_id: report.id,
      company: {
        name: company.company_name,
        rc_number: rc_number,
        industry: company.industry
      },
      trust_score: trustScore.overall_score,
      risk_level: trustScore.risk_level,
      price_naira: report.price_naira,
      payment: {
        amount_kobo: report.price_naira * 100,
        paystack_url: paystackResponse.data.data.authorization_url,
        reference: paystackResponse.data.data.reference
      }
    });

  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Get embeddable badge widget
app.get('/api/v1/widget/badge', async (req, res) => {
  try {
    const { rc } = req.query;

    if (!rc) {
      return res.status(400).json({ error: 'rc parameter required' });
    }

    // Get trust score
    const scoreResult = await pgPool.query(
      'SELECT * FROM trust_scores WHERE rc_number = $1',
      [rc]
    );

    if (scoreResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const score = scoreResult.rows[0];

    // Generate embed code
    const embedCode = `
<div id="brandstrack-badge-${rc}" style="padding: 10px; background: #f5f5f5; border-radius: 4px; font-family: Arial;">
  <div style="font-weight: bold; margin-bottom: 5px;">BrandsTrack Trust Score</div>
  <div style="font-size: 24px; color: ${score.overall_score > 70 ? '#10b981' : '#f59e0b'}; font-weight: bold;">
    ${score.overall_score}%
  </div>
  <div style="font-size: 12px; color: #666;">Risk: ${score.risk_level}</div>
  <script src="https://brandstrack.com/widget.js" data-rc="${rc}"></script>
</div>
    `.trim();

    res.json({
      rc_number: rc,
      score: score.overall_score,
      risk_level: score.risk_level,
      embed_code: embedCode,
      embed_html: `<iframe src="https://brandstrack.com/widget?rc=${rc}" width="200" height="120" frameborder="0"></iframe>`
    });

  } catch (error) {
    console.error('Error getting badge:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PHASE 2: B2B SAAS DASHBOARD
// ============================================================================

// Middleware: API Key validation
const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-brandstrack-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  if (apiKey.length < 20) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.apiKey = apiKey;
  next();
};

// Endpoint: Full KYB (Know Your Business) Verification
app.get('/api/v1/kyb/verify', validateApiKey, async (req, res) => {
  try {
    const { rc } = req.query;

    if (!rc) {
      return res.status(400).json({ error: 'rc parameter required' });
    }

    // Get company data
    const companyResult = await pgPool.query(
      'SELECT * FROM company_cache WHERE rc_number = $1',
      [rc]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];

    // Get trust score
    const scoreResult = await pgPool.query(
      'SELECT * FROM trust_scores WHERE rc_number = $1',
      [rc]
    );

    const score = scoreResult.rows[0] || { overall_score: 75 };

    // Get directors from database (Neo4j optional)
    let directors = [];
    if (neo4jConnected) {
      try {
        const directorResult = await neo4jDriver.executeQuery(
          `MATCH (c:Company {rc_number: $rc})<-[:ASSOCIATED_WITH]-(d:Director)
           RETURN d.full_name as name, d.role as role`,
          { rc }
        );
        directors = directorResult.records.map(r => ({
          name: r.get('name'),
          role: r.get('role')
        }));
      } catch (err) {
        console.warn('Neo4j query failed, using fallback:', err.message);
      }
    }

    // Fallback to database directors
    if (directors.length === 0) {
      directors = JSON.parse(company.directors || '[]');
    }

    res.json({
      rc_number: rc,
      company_name: company.company_name,
      industry: company.industry,
      status: company.status,
      registration_date: company.registration_date,
      verified: company.is_verified,
      trust_score: score.overall_score,
      risk_level: score.risk_level,
      address: `${company.address_line_1}, ${company.city}, ${company.state}`,
      phone: company.phone,
      email: company.email,
      directors: directors,
      verification_timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error verifying KYB:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Velocity Fraud Score
app.get('/api/v1/risk/velocity', validateApiKey, async (req, res) => {
  try {
    const { rc } = req.query;

    if (!rc) {
      return res.status(400).json({ error: 'rc parameter required' });
    }

    // Get company
    const companyResult = await pgPool.query(
      'SELECT * FROM company_cache WHERE rc_number = $1',
      [rc]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];

    // Get recent changes
    const changesResult = await pgPool.query(
      `SELECT * FROM company_changes 
       WHERE company_id = $1 
       ORDER BY detected_at DESC 
       LIMIT 10`,
      [company.id]
    );

    const changes = changesResult.rows;

    // Calculate velocity score (0-100)
    const riskPoints = changes.reduce((sum, change) => sum + (change.risk_points || 0), 0);
    const velocityScore = Math.min(100, riskPoints);

    res.json({
      rc_number: rc,
      velocity_score: velocityScore,
      risk_level: velocityScore > 70 ? 'HIGH' : velocityScore > 40 ? 'MEDIUM' : 'LOW',
      recent_changes: changes.map(c => ({
        type: c.change_type,
        description: c.description,
        risk_points: c.risk_points,
        detected_at: c.detected_at
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting velocity score:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Director Network Graph (Neo4j optional)
app.get('/api/v1/nexus/graph', validateApiKey, async (req, res) => {
  try {
    const { rc } = req.query;

    if (!rc) {
      return res.status(400).json({ error: 'rc parameter required' });
    }

    let sisterEntities = [];

    if (neo4jConnected) {
      try {
        const graphResult = await neo4jDriver.executeQuery(
          `MATCH (c:Company {rc_number: $rc})<-[:ASSOCIATED_WITH]-(d:Director)-[:ASSOCIATED_WITH]->(other:Company)
           WHERE other.rc_number <> $rc
           RETURN d.full_name as director, other.rc_number as company_rc, other.name as company_name, other.industry as industry
           LIMIT 20`,
          { rc }
        );

        sisterEntities = graphResult.records.map(r => ({
          director: r.get('director'),
          company_rc: r.get('company_rc'),
          company_name: r.get('company_name'),
          industry: r.get('industry')
        }));
      } catch (err) {
        console.warn('Neo4j graph query failed:', err.message);
      }
    }

    res.json({
      rc_number: rc,
      director_connections: sisterEntities.length,
      sister_entities: sisterEntities,
      neo4j_status: neo4jConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting graph:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Report Dispute
app.post('/api/v1/disputes/report', validateApiKey, async (req, res) => {
  try {
    const { rc_number, dispute_type, description, amount_naira } = req.body;

    if (!rc_number || !dispute_type || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get company
    const companyResult = await pgPool.query(
      'SELECT id FROM company_cache WHERE rc_number = $1',
      [rc_number]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Create dispute record
    const disputeResult = await pgPool.query(
      `INSERT INTO disputes (company_id, rc_number, dispute_type, description, amount_naira, reported_by_email, reported_by_subscription_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        companyResult.rows[0].id,
        rc_number,
        dispute_type,
        description,
        amount_naira || 0,
        'api_user@brandstrack.com',
        '00000000-0000-0000-0000-000000000000'
      ]
    );

    res.json({
      success: true,
      dispute_id: disputeResult.rows[0].id,
      message: 'Dispute reported successfully',
      impact: 'Trust score will be reduced by 15 points upon verification'
    });

  } catch (error) {
    console.error('Error reporting dispute:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PHASE 2.5: B2B SAAS SUBSCRIPTIONS
// ============================================================================

// Endpoint: Subscribe to B2B SaaS plan
app.post('/api/v1/saas/subscribe', async (req, res) => {
  try {
    const { plan, email, organization_name, amount } = req.body;

    if (!plan || !email || !organization_name || !amount) {
      return res.status(400).json({ error: 'plan, email, organization_name, and amount required' });
    }

    // Validate plan (case-insensitive)
    const planLower = plan.toLowerCase();
    const validPlans = {
      'starter': 35000,
      'growth': 85000
    };

    if (!validPlans[planLower] || validPlans[planLower] !== amount) {
      return res.status(400).json({ error: `Invalid plan "${plan}" or amount. Starter: ₦35000, Growth: ₦85000` });
    }

    // Create subscription record with correct column names
    const subscriptionResult = await pgPool.query(
      `INSERT INTO saas_subscriptions (organization_name, organization_email, organization_phone, plan_type, plan_price_naira)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, plan_type, plan_price_naira`,
      [organization_name, email, '', planLower, amount]
    );

    const subscription = subscriptionResult.rows[0];

    // Create Paystack payment link
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: email,
        amount: amount * 100, // Convert to kobo
        metadata: {
          subscription_id: subscription.id,
          organization_name: organization_name,
          plan_type: planLower,
          type: 'b2b_subscription'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    res.json({
      success: true,
      subscription_id: subscription.id,
      organization_name: organization_name,
      organization_email: email,
      plan_type: planLower,
      plan_price_naira: amount,
      payment: {
        amount_kobo: amount * 100,
        paystack_url: paystackResponse.data.data.authorization_url,
        reference: paystackResponse.data.data.reference
      }
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PHASE 3: ENTERPRISE API - WEBHOOK MONITORING & USAGE-BASED BILLING
// ============================================================================

// Middleware: Usage tracking
const trackUsage = async (req, res, next) => {
  const apiKey = req.headers['x-brandstrack-api-key'];
  const endpoint = req.path;
  
  req.usage = {
    apiKey,
    endpoint,
    startTime: Date.now()
  };
  
  next();
};

app.use(trackUsage);

// Log usage after response
app.use((req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Record usage in database (async, don't block response)
    if (req.usage && req.usage.apiKey) {
      const endTime = Date.now();
      const duration = endTime - req.usage.startTime;
      
      pgPool.query(
        `INSERT INTO api_usage (api_key, endpoint, status_code, response_time_ms, called_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.usage.apiKey, req.usage.endpoint, res.statusCode, duration]
      ).catch(err => console.error('Usage tracking failed:', err.message));
    }
    
    return originalSend.call(this, data);
  };
  
  next();
});

// ============================================================================
// ENTERPRISE ENDPOINTS (Usage-Based Billing)
// ============================================================================

// Endpoint: Full KYB with director graph (₦300/call)
app.post('/api/v1/enterprise/kyb-plus', validateApiKey, async (req, res) => {
  try {
    const { rc_number, include_graph, include_disputes } = req.body;

    if (!rc_number) {
      return res.status(400).json({ error: 'rc_number required' });
    }

    // Get company
    const companyResult = await pgPool.query(
      'SELECT * FROM company_cache WHERE rc_number = $1',
      [rc_number]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];

    // Get trust score
    const scoreResult = await pgPool.query(
      'SELECT * FROM trust_scores WHERE rc_number = $1',
      [rc_number]
    );

    const score = scoreResult.rows[0] || { overall_score: 75, risk_level: 'medium' };

    // Get directors
    let directors = JSON.parse(company.directors || '[]');
    let sisterEntities = [];

    if (include_graph && neo4jConnected) {
      try {
        const graphResult = await neo4jDriver.executeQuery(
          `MATCH (c:Company {rc_number: $rc})<-[:ASSOCIATED_WITH]-(d:Director)-[:ASSOCIATED_WITH]->(other:Company)
           WHERE other.rc_number <> $rc
           RETURN d.full_name as director, other.rc_number as company_rc, other.name as company_name
           LIMIT 50`,
          { rc: rc_number }
        );

        sisterEntities = graphResult.records.map(r => ({
          director: r.get('director'),
          related_company_rc: r.get('company_rc'),
          related_company_name: r.get('company_name')
        }));
      } catch (err) {
        console.warn('Neo4j query failed:', err.message);
      }
    }

    // Get disputes if requested
    let disputes = [];
    if (include_disputes) {
      const disputeResult = await pgPool.query(
        'SELECT * FROM disputes WHERE rc_number = $1 LIMIT 20',
        [rc_number]
      );
      disputes = disputeResult.rows;
    }

    res.json({
      success: true,
      rc_number: rc_number,
      company_name: company.company_name,
      industry: company.industry,
      status: company.status,
      registration_date: company.registration_date,
      trust_score: score.overall_score,
      risk_level: score.risk_level,
      directors: directors,
      sister_entities: sisterEntities,
      disputes: disputes,
      timestamp: new Date().toISOString(),
      cost_naira: 300
    });

  } catch (error) {
    console.error('Error in KYB+:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Bulk verification (₦150/call, processes multiple companies)
app.post('/api/v1/enterprise/bulk-verify', validateApiKey, async (req, res) => {
  try {
    const { rc_numbers } = req.body;

    if (!rc_numbers || !Array.isArray(rc_numbers) || rc_numbers.length === 0) {
      return res.status(400).json({ error: 'rc_numbers array required' });
    }

    if (rc_numbers.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 companies per request' });
    }

    // Fetch all companies
    const companiesResult = await pgPool.query(
      'SELECT * FROM company_cache WHERE rc_number = ANY($1)',
      [rc_numbers]
    );

    const companies = companiesResult.rows;

    // Get trust scores for all
    const scoresResult = await pgPool.query(
      'SELECT * FROM trust_scores WHERE rc_number = ANY($1)',
      [rc_numbers]
    );

    const scoresMap = {};
    scoresResult.rows.forEach(s => {
      scoresMap[s.rc_number] = s;
    });

    // Build response
    const results = companies.map(company => ({
      rc_number: company.rc_number,
      company_name: company.company_name,
      industry: company.industry,
      status: company.status,
      trust_score: scoresMap[company.rc_number]?.overall_score || 50,
      risk_level: scoresMap[company.rc_number]?.risk_level || 'unknown',
      verified: company.is_verified
    }));

    res.json({
      success: true,
      total_verified: results.length,
      companies: results,
      cost_naira: 150
    });

  } catch (error) {
    console.error('Error in bulk verify:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Real-time monitoring subscription
app.post('/api/v1/enterprise/monitor/subscribe', validateApiKey, async (req, res) => {
  try {
    const { rc_numbers, webhook_url, events } = req.body;

    if (!rc_numbers || !Array.isArray(rc_numbers) || rc_numbers.length === 0) {
      return res.status(400).json({ error: 'rc_numbers array required' });
    }

    if (!webhook_url) {
      return res.status(400).json({ error: 'webhook_url required' });
    }

    const validEvents = ['company:changed', 'risk_score:updated', 'director:changed', 'dispute:filed'];
    const selectedEvents = events || validEvents;

    // Create monitoring registry
    const monitoringId = 'mon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const registryResult = await pgPool.query(
      `INSERT INTO monitoring_registry (monitoring_id, rc_numbers, webhook_url, events, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING monitoring_id`,
      [monitoringId, rc_numbers, webhook_url, selectedEvents, 'active']
    );

    res.json({
      success: true,
      monitoring_id: monitoringId,
      companies_monitored: rc_numbers.length,
      webhook_url: webhook_url,
      events: selectedEvents,
      status: 'active',
      message: 'Webhook will receive real-time updates for monitored companies',
      cost_naira: 50 + (rc_numbers.length * 10) // ₦50 base + ₦10 per company
    });

  } catch (error) {
    console.error('Error in monitor subscribe:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Get enterprise usage & billing
app.get('/api/v1/enterprise/billing', validateApiKey, async (req, res) => {
  try {
    const apiKey = req.headers['x-brandstrack-api-key'];

    // Get this month's usage
    const usageResult = await pgPool.query(
      `SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN endpoint LIKE '%enterprise%' THEN 1 ELSE 0 END) as enterprise_calls,
        AVG(response_time_ms) as avg_response_time
       FROM api_usage 
       WHERE api_key = $1 
       AND called_at >= NOW() - INTERVAL '30 days'`,
      [apiKey]
    );

    const usage = usageResult.rows[0];

    // Calculate bill (₦150-300 per enterprise call)
    const avgCostPerCall = 225; // ₦225 average
    const estimatedMonthlyBill = (usage.enterprise_calls || 0) * avgCostPerCall;

    // Apply volume discounts
    let discount = 0;
    let discountPercent = 0;
    if (estimatedMonthlyBill >= 5000000) {
      discountPercent = 20;
      discount = estimatedMonthlyBill * 0.20;
    } else if (estimatedMonthlyBill >= 1000000) {
      discountPercent = 10;
      discount = estimatedMonthlyBill * 0.10;
    }

    const finalBill = Math.max(estimatedMonthlyBill - discount, 50000); // Minimum ₦50K

    res.json({
      success: true,
      api_key: apiKey.slice(0, 10) + '...',
      period: 'Last 30 days',
      total_api_calls: usage.total_calls || 0,
      enterprise_api_calls: usage.enterprise_calls || 0,
      avg_response_time_ms: Math.round(usage.avg_response_time || 0),
      pricing: {
        per_call: 225,
        minimum_monthly: 50000
      },
      estimated_monthly_bill: estimatedMonthlyBill,
      volume_discount: {
        percent: discountPercent,
        amount: discount
      },
      final_bill_naira: Math.round(finalBill),
      next_invoice_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      payment_status: 'pending'
    });

  } catch (error) {
    console.error('Error in billing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Webhook event delivery status
app.get('/api/v1/enterprise/monitor/status', validateApiKey, async (req, res) => {
  try {
    const { monitoring_id } = req.query;

    if (!monitoring_id) {
      return res.status(400).json({ error: 'monitoring_id required' });
    }

    const statusResult = await pgPool.query(
      'SELECT * FROM monitoring_registry WHERE monitoring_id = $1',
      [monitoring_id]
    );

    if (statusResult.rows.length === 0) {
      return res.status(404).json({ error: 'Monitoring not found' });
    }

    const monitoring = statusResult.rows[0];

    // Get delivery stats
    const deliveryResult = await pgPool.query(
      `SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM event_log 
       WHERE monitoring_id = $1`,
      [monitoring_id]
    );

    const delivery = deliveryResult.rows[0];

    res.json({
      success: true,
      monitoring_id: monitoring_id,
      status: monitoring.status,
      companies_monitored: monitoring.rc_numbers.length,
      webhook_url: monitoring.webhook_url,
      events_subscribed: monitoring.events,
      delivery_stats: {
        total_events: parseInt(delivery.total_events) || 0,
        delivered: parseInt(delivery.delivered) || 0,
        failed: parseInt(delivery.failed) || 0,
        pending: parseInt(delivery.pending) || 0,
        success_rate: delivery.total_events > 0 
          ? Math.round((parseInt(delivery.delivered) / parseInt(delivery.total_events)) * 100) 
          : 0
      },
      created_at: monitoring.created_at,
      last_event: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting monitor status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Cancel monitoring subscription
app.post('/api/v1/enterprise/monitor/cancel', validateApiKey, async (req, res) => {
  try {
    const { monitoring_id } = req.body;

    if (!monitoring_id) {
      return res.status(400).json({ error: 'monitoring_id required' });
    }

    const cancelResult = await pgPool.query(
      'UPDATE monitoring_registry SET status = $1 WHERE monitoring_id = $2 RETURNING monitoring_id',
      ['cancelled', monitoring_id]
    );

    if (cancelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Monitoring not found' });
    }

    res.json({
      success: true,
      message: 'Monitoring subscription cancelled',
      monitoring_id: monitoring_id,
      status: 'cancelled'
    });

  } catch (error) {
    console.error('Error cancelling monitoring:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

// Endpoint: Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email !== 'admin@brandstrack.com' || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      token: 'admin_token_' + Date.now(),
      user: { email, role: 'admin' }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 404 HANDLER
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ============================================================================
// SERVER START
// ============================================================================

async function startServer() {
  try {
    // Test PostgreSQL (REQUIRED)
    const pgTest = await pgPool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');

    // Test Neo4j (OPTIONAL)
    if (process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD) {
      try {
        neo4jDriver = neo4j.driver(
          process.env.NEO4J_URI,
          neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
        );
        const neoTest = await neo4jDriver.executeQuery('RETURN 1');
        console.log('✅ Neo4j connected');
        neo4jConnected = true;
      } catch (neoError) {
        console.log('⚠️  Neo4j connection failed:', neoError.message);
        console.log('   (Continuing without Neo4j - basic features still work)');
        neo4jConnected = false;
      }
    } else {
      console.log('⚠️  Neo4j credentials not provided - skipping Neo4j connection');
    }

    // Start server
    app.listen(PORT, () => {
      console.log('\n╔════════════════════════════════════════╗');
      console.log('║  🚀 BRANDSTRACK v5.0 - LIVE           ║');
      console.log('║  Fraud Intelligence Platform          ║');
      console.log(`║  Listening on port ${PORT}                 ║`);
      console.log(`║  Environment: ${NODE_ENV.padEnd(22)}║`);
      console.log(`║  Neo4j: ${neo4jConnected ? 'CONNECTED  ' : 'OPTIONAL   '}              ║`);
      console.log('╚════════════════════════════════════════╝\n');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down gracefully...');
  await pgPool.end();
  if (neo4jDriver) {
    await neo4jDriver.close();
  }
  process.exit(0);
});

module.exports = app;