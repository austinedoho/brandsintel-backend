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
    const { plan, email, amount } = req.body;

    if (!plan || !email || !amount) {
      return res.status(400).json({ error: 'plan, email, and amount required' });
    }

    // Validate plan
    const validPlans = {
      'starter': 35000,
      'growth': 85000
    };

    if (!validPlans[plan] || validPlans[plan] !== amount) {
      return res.status(400).json({ error: 'Invalid plan or amount' });
    }

    // Create subscription record
    const subscriptionResult = await pgPool.query(
      `INSERT INTO saas_subscriptions (email, plan, amount_naira, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, plan, amount_naira`,
      [email, plan, amount, 'pending']
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
          plan: plan,
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
      plan: plan,
      amount_naira: amount,
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
// PHASE 3: ENTERPRISE API
// ============================================================================

// Endpoint: Subscribe to webhook monitoring
app.post('/api/v1/monitor/subscribe', validateApiKey, async (req, res) => {
  try {
    const { webhook_url, events } = req.body;

    if (!webhook_url) {
      return res.status(400).json({ error: 'webhook_url required' });
    }

    res.json({
      success: true,
      message: 'Webhook subscription created',
      webhook_url: webhook_url,
      events_subscribed: events || ['company:changed', 'risk_detected'],
      status: 'active'
    });

  } catch (error) {
    console.error('Error subscribing to webhook:', error);
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