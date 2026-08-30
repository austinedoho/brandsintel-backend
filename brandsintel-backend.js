// ============================================================================
// BRANDSTRACK v5.0 BACKEND - COMPLETE WITH AUTHENTICATION
// ============================================================================

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================================
// SECURITY & MIDDLEWARE
// ============================================================================

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Auth config
const JWT_SECRET = process.env.JWT_SECRET || 'brandstrack-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pgPool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate API key
function generateAPIKey() {
    return 'sk_' + crypto.randomBytes(32).toString('hex');
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

function verifyAuth(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ 
                error: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();

    } catch (error) {
        res.status(401).json({ 
            error: 'Invalid or expired token' 
        });
    }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT NOW()');
        res.json({
            status: 'ok',
            version: '5.0',
            environment: process.env.NODE_ENV || 'production',
            databases: {
                postgresql: 'connected'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// ============================================================================
// PHASE 1: TRUST REPORTS (B2C)
// ============================================================================

// Widget Badge Endpoint
app.get('/api/v1/widget/badge', async (req, res) => {
    try {
        const { rc } = req.query;

        if (!rc) {
            return res.status(400).json({ error: 'RC number required' });
        }

        const result = await pgPool.query(
            'SELECT * FROM company_cache WHERE rc_number = $1',
            [rc]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const company = result.rows[0];

        const scoreResult = await pgPool.query(
            'SELECT * FROM trust_scores WHERE rc_number = $1',
            [rc]
        );

        const score = scoreResult.rows[0] || { overall_score: 75, risk_level: 'medium' };

        res.json({
            rc_number: company.rc_number,
            company_name: company.company_name,
            score: score.overall_score,
            risk_level: score.risk_level,
            industry: company.industry,
            status: company.status
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate Report Endpoint (Paystack Payment)
app.post('/api/v1/reports/generate', async (req, res) => {
    try {
        const { rc_number, email, organization_name, amount, plan } = req.body;

        if (!rc_number || !email) {
            return res.status(400).json({ error: 'RC number and email required' });
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

        // Initialize Paystack payment
        const paystackAmount = (amount || 3500) * 100; // Convert to kobo

        const paystackResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: email,
                amount: paystackAmount,
                metadata: {
                    rc_number: rc_number,
                    company_name: company.company_name,
                    report_type: plan || 'basic',
                    organization_name: organization_name
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
            company: {
                rc_number: company.rc_number,
                company_name: company.company_name,
                trust_score: score.overall_score,
                risk_level: score.risk_level
            },
            payment: {
                reference: paystackResponse.data.data.reference,
                paystack_url: paystackResponse.data.data.authorization_url,
                amount_kobo: paystackAmount,
                amount_naira: amount || 3500
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// PHASE 2: B2B SAAS DASHBOARD
// ============================================================================

// Subscribe to SaaS
app.post('/api/v1/saas/subscribe', async (req, res) => {
    try {
        const { plan, email, organization_name, amount } = req.body;

        if (!plan || !email || !organization_name || !amount) {
            return res.status(400).json({ 
                error: 'Plan, email, organization_name, and amount required' 
            });
        }

        const planLower = plan.toLowerCase();
        const validPlans = { 'starter': 35000, 'growth': 85000 };

        if (!validPlans[planLower]) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        // Store subscription in database
        const subResult = await pgPool.query(
            `INSERT INTO saas_subscriptions (organization_name, organization_email, organization_phone, plan_type, plan_price_naira)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, plan_type, plan_price_naira`,
            [organization_name, email, '', planLower, amount]
        );

        // Initialize Paystack payment
        const paystackAmount = amount * 100; // Convert to kobo

        const paystackResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: email,
                amount: paystackAmount,
                metadata: {
                    subscription_id: subResult.rows[0].id,
                    organization_name: organization_name,
                    plan_type: planLower
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
            subscription: subResult.rows[0],
            payment: {
                reference: paystackResponse.data.data.reference,
                paystack_url: paystackResponse.data.data.authorization_url,
                amount_naira: amount
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// PHASE 3: ENTERPRISE API - USAGE-BASED BILLING
// ============================================================================

// KYB+ Endpoint (₦300/call)
app.post('/api/v1/enterprise/kyb-plus', async (req, res) => {
    try {
        const { rc_number, include_graph, include_disputes } = req.body;

        if (!rc_number) {
            return res.status(400).json({ error: 'rc_number required' });
        }

        const companyResult = await pgPool.query(
            'SELECT * FROM company_cache WHERE rc_number = $1',
            [rc_number]
        );

        if (companyResult.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const company = companyResult.rows[0];

        const scoreResult = await pgPool.query(
            'SELECT * FROM trust_scores WHERE rc_number = $1',
            [rc_number]
        );

        const score = scoreResult.rows[0] || { overall_score: 75, risk_level: 'medium' };

        // Get directors
        let directors = [];
        try {
            directors = JSON.parse(company.directors || '[]');
        } catch (e) {
            directors = company.directors || [];
        }

        let sisterEntities = [];

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

// Bulk Verify Endpoint (₦150/call)
app.post('/api/v1/enterprise/bulk-verify', async (req, res) => {
    try {
        const { rc_numbers } = req.body;

        if (!rc_numbers || !Array.isArray(rc_numbers) || rc_numbers.length === 0) {
            return res.status(400).json({ error: 'rc_numbers array required' });
        }

        if (rc_numbers.length > 100) {
            return res.status(400).json({ error: 'Maximum 100 companies per request' });
        }

        const companiesResult = await pgPool.query(
            'SELECT * FROM company_cache WHERE rc_number = ANY($1)',
            [rc_numbers]
        );

        const companies = companiesResult.rows;

        const scoresResult = await pgPool.query(
            'SELECT * FROM trust_scores WHERE rc_number = ANY($1)',
            [rc_numbers]
        );

        const scoresMap = {};
        scoresResult.rows.forEach(s => {
            scoresMap[s.rc_number] = s;
        });

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

// Monitor Subscribe Endpoint
app.post('/api/v1/enterprise/monitor/subscribe', async (req, res) => {
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

        const monitoringId = 'mon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const registryResult = await pgPool.query(
            `INSERT INTO monitoring_registry (monitoring_id, rc_numbers, webhook_url, events, status, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING monitoring_id`,
            [monitoringId, JSON.stringify(rc_numbers), webhook_url, JSON.stringify(selectedEvents), 'active']
        );

        res.json({
            success: true,
            monitoring_id: monitoringId,
            companies_monitored: rc_numbers.length,
            webhook_url: webhook_url,
            events: selectedEvents,
            status: 'active',
            message: 'Webhook will receive real-time updates for monitored companies',
            cost_naira: 50 + (rc_numbers.length * 10)
        });

    } catch (error) {
        console.error('Error in monitor subscribe:', error);
        res.status(500).json({ error: error.message });
    }
});

// Billing Endpoint
app.get('/api/v1/enterprise/billing', async (req, res) => {
    try {
        const apiKey = req.headers['x-brandstrack-api-key'];

        // Sample billing data
        const totalCalls = 50;
        const enterpriseCalls = 15;
        const avgCostPerCall = 225;
        const estimatedMonthlyBill = enterpriseCalls * avgCostPerCall;

        let discount = 0;
        let discountPercent = 0;
        if (estimatedMonthlyBill >= 5000000) {
            discountPercent = 20;
            discount = estimatedMonthlyBill * 0.20;
        } else if (estimatedMonthlyBill >= 1000000) {
            discountPercent = 10;
            discount = estimatedMonthlyBill * 0.10;
        }

        const finalBill = Math.max(estimatedMonthlyBill - discount, 50000);

        res.json({
            success: true,
            api_key: apiKey ? apiKey.slice(0, 10) + '...' : 'not-provided',
            period: 'Last 30 days',
            total_api_calls: totalCalls,
            enterprise_api_calls: enterpriseCalls,
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
            payment_status: 'pending',
            note: 'Sample billing data - full usage tracking coming soon'
        });

    } catch (error) {
        console.error('Error in billing:', error);
        res.status(500).json({ error: error.message });
    }
});

// Monitor Status Endpoint
app.get('/api/v1/enterprise/monitor/status', async (req, res) => {
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
            companies_monitored: Array.isArray(monitoring.rc_numbers) ? monitoring.rc_numbers.length : JSON.parse(monitoring.rc_numbers).length,
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

// Cancel Monitoring Endpoint
app.post('/api/v1/enterprise/monitor/cancel', async (req, res) => {
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
// AUTHENTICATION ENDPOINTS
// ============================================================================

// Sign Up
app.post('/api/v1/auth/signup', async (req, res) => {
    try {
        const { email, password, company_name } = req.body;

        if (!email || !password || !company_name) {
            return res.status(400).json({ 
                error: 'Email, password, and company name required' 
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ 
                error: 'Password must be at least 8 characters' 
            });
        }

        if (!email.includes('@')) {
            return res.status(400).json({ 
                error: 'Invalid email address' 
            });
        }

        const existingUser = await pgPool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                error: 'Email already registered' 
            });
        }

        const passwordHash = hashPassword(password);
        const apiKey = generateAPIKey();

        const result = await pgPool.query(
            `INSERT INTO users (email, password_hash, company_name, api_key, subscription_tier, subscription_status)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, email, company_name, subscription_tier`,
            [email.toLowerCase(), passwordHash, company_name, apiKey, null, 'inactive']
        );

        const user = result.rows[0];

        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email 
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await pgPool.query(
            `INSERT INTO user_sessions (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, token, expiresAt]
        );

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            user: {
                id: user.id,
                email: user.email,
                company_name: user.company_name
            },
            token: token,
            expiresIn: JWT_EXPIRY
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password required' 
            });
        }

        const result = await pgPool.query(
            'SELECT id, email, password_hash, company_name, subscription_tier, subscription_status, api_key FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        const user = result.rows[0];

        const passwordHash = hashPassword(password);
        if (user.password_hash !== passwordHash) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        await pgPool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email 
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await pgPool.query(
            `INSERT INTO user_sessions (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, token, expiresAt]
        );

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                company_name: user.company_name,
                subscription_tier: user.subscription_tier,
                subscription_status: user.subscription_status
            },
            token: token,
            expiresIn: JWT_EXPIRY
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Verify Token
app.get('/api/v1/auth/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ 
                error: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        const result = await pgPool.query(
            'SELECT id, email, company_name, subscription_tier, subscription_status, last_login FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'User not found' 
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                company_name: user.company_name,
                subscription_tier: user.subscription_tier,
                subscription_status: user.subscription_status
            }
        });

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expired' 
            });
        }
        res.status(401).json({ 
            error: 'Invalid token' 
        });
    }
});

// Logout
app.post('/api/v1/auth/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token) {
            await pgPool.query(
                'UPDATE user_sessions SET active = false WHERE token = $1',
                [token]
            );
        }

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get User Profile (Protected)
app.get('/api/v1/user/profile', verifyAuth, async (req, res) => {
    try {
        const result = await pgPool.query(
            `SELECT id, email, company_name, subscription_tier, subscription_status, 
                    subscription_start_date, subscription_end_date, api_key, created_at 
             FROM users WHERE id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'User not found' 
            });
        }

        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update Subscription (Protected)
app.post('/api/v1/user/subscribe', verifyAuth, async (req, res) => {
    try {
        const { tier, amount } = req.body;
        const validTiers = ['starter', 'growth', 'enterprise'];

        if (!validTiers.includes(tier)) {
            return res.status(400).json({ 
                error: 'Invalid subscription tier' 
            });
        }

        const result = await pgPool.query(
            `UPDATE users 
             SET subscription_tier = $1, subscription_status = $2, subscription_start_date = NOW(),
                 subscription_end_date = NOW() + INTERVAL '30 days'
             WHERE id = $3
             RETURNING id, subscription_tier, subscription_status, subscription_start_date, subscription_end_date`,
            [tier, 'active', req.user.userId]
        );

        await pgPool.query(
            `INSERT INTO subscription_history (user_id, tier, amount_naira, status)
             VALUES ($1, $2, $3, $4)`,
            [req.user.userId, tier, amount, 'completed']
        );

        res.json({
            success: true,
            message: 'Subscription updated',
            subscription: result.rows[0]
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ERROR HANDLING & SERVER START
// ============================================================================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
    console.log(`✅ BrandsTrack v5.0 Backend running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`🔐 Auth: JWT enabled`);
    console.log(`💳 Payment: Paystack integration active`);
});
