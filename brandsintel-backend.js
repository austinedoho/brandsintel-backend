const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ============ PAYSTACK CONFIGURATION (NO HARDCODED KEYS!) ============
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC;
const PAYSTACK_API = 'https://api.paystack.co';

if (!PAYSTACK_SECRET) {
    console.error('❌ ERROR: PAYSTACK_SECRET not set in environment variables!');
    console.error('Please set PAYSTACK_SECRET in Render environment variables');
}

console.log('🔑 Paystack configured from environment variables');

// ============ PERSISTENT DATA STORAGE ============
let appData = {
    premium_monthly_price: parseInt(process.env.PREMIUM_PRICE || '30000'),
    premium_currency: 'NGN',
    free_searches_per_day: 3,
    articles_per_company: 9,
    featured_listing_enabled: true,
    customer_reviews_enabled: true,
    api_access_enabled: false,
    fraud_response_enabled: false,
    certificate_download_enabled: true,
    priority_support_enabled: true
};

let payments = [];
let companies = {};

console.log('💾 Initial settings loaded:', appData.premium_monthly_price);

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    console.log('✅ Health check requested');
    res.json({
        status: '✅ OK',
        version: '3.0',
        premium_price: appData.premium_monthly_price,
        paystack: 'integrated',
        features: [
            'CAC Verification',
            'Trust Scores',
            'News Intelligence',
            'Paystack Payments (LIVE)',
            'Complete Admin Dashboard',
            'Payment Management',
            'Company Management',
            'Dynamic Settings'
        ]
    });
});

// ============ PUBLIC SETTINGS ENDPOINT (NO AUTH) ============
app.get('/api/settings/public', (req, res) => {
    console.log('📊 Public settings requested - returning price:', appData.premium_monthly_price);
    res.json({
        success: true,
        settings: {
            premium_monthly_price: appData.premium_monthly_price,
            premium_currency: appData.premium_currency,
            free_searches_per_day: appData.free_searches_per_day,
            articles_per_company: appData.articles_per_company,
            featured_listing_enabled: appData.featured_listing_enabled,
            customer_reviews_enabled: appData.customer_reviews_enabled,
            certificate_download_enabled: appData.certificate_download_enabled,
            priority_support_enabled: appData.priority_support_enabled
        }
    });
});

// ============ ADMIN AUTHENTICATION ============
function verifyAdmin(req, res, next) {
    const adminKey = req.headers['x-admin-key'] || req.body.admin_key;
    const expectedKey = process.env.ADMIN_PASSWORD || 'BrandsIntel2024';
    
    console.log('🔐 Admin auth check');
    
    if (adminKey !== expectedKey) {
        console.log('❌ Auth failed');
        return res.status(401).json({ error: 'Unauthorized: Invalid admin key' });
    }
    console.log('✅ Admin authenticated');
    next();
}

// ============ ADMIN SETTINGS ENDPOINTS ============
app.get('/api/admin/settings', verifyAdmin, (req, res) => {
    console.log('📊 Admin requested settings:', appData.premium_monthly_price);
    res.json({
        success: true,
        settings: appData
    });
});

app.post('/api/admin/settings/update', verifyAdmin, (req, res) => {
    try {
        console.log('💾 Admin updating settings:', req.body);
        
        const { 
            premium_monthly_price, 
            free_searches_per_day,
            articles_per_company,
            featured_listing_enabled,
            customer_reviews_enabled,
            api_access_enabled,
            fraud_response_enabled,
            certificate_download_enabled,
            priority_support_enabled
        } = req.body;

        if (premium_monthly_price !== undefined) {
            appData.premium_monthly_price = premium_monthly_price;
            console.log('✅ Price updated to:', premium_monthly_price);
            process.env.PREMIUM_PRICE = premium_monthly_price;
        }
        if (free_searches_per_day !== undefined) appData.free_searches_per_day = free_searches_per_day;
        if (articles_per_company !== undefined) appData.articles_per_company = articles_per_company;
        if (featured_listing_enabled !== undefined) appData.featured_listing_enabled = featured_listing_enabled;
        if (customer_reviews_enabled !== undefined) appData.customer_reviews_enabled = customer_reviews_enabled;
        if (api_access_enabled !== undefined) appData.api_access_enabled = api_access_enabled;
        if (fraud_response_enabled !== undefined) appData.fraud_response_enabled = fraud_response_enabled;
        if (certificate_download_enabled !== undefined) appData.certificate_download_enabled = certificate_download_enabled;
        if (priority_support_enabled !== undefined) appData.priority_support_enabled = priority_support_enabled;

        console.log('✅ Settings updated successfully:', appData.premium_monthly_price);
        
        res.json({
            success: true,
            message: 'Settings updated successfully',
            settings: appData
        });
    } catch (err) {
        console.error('❌ Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings', details: err.message });
    }
});

// ============ COMPANY SEARCH ENDPOINT ============
app.get('/api/companies/search', (req, res) => {
    const query = req.query.q?.toLowerCase() || '';
    console.log('🔍 Search query:', query);

    if (!query) {
        return res.json({ 
            success: false, 
            results: [],
            message: 'Please provide a search query'
        });
    }

    const mockCompanies = {
        'mtn': {
            id: 'mtn-001',
            name: 'MTN Nigeria',
            cac_number: 'RC123456',
            industry: 'Telecommunications',
            location: 'Lagos, Nigeria',
            address: '19A, Kofo Abayomi Street, Lagos',
            email: 'contact@mtn.com.ng',
            phone: '+234 803 000 0000',
            website: 'https://www.mtn.com.ng',
            description: 'Leading telecommunications provider in Nigeria',
            trust_score: 95,
            verification_status: 'verified',
            risk_level: 'low',
            founded: 2001,
            employees: 5000,
            is_premium: false,
            news: [
                {
                    id: 'news-1',
                    title: 'MTN Nigeria Expands 5G Network Coverage',
                    source: 'Tech Africa Daily',
                    published_date: '2026-08-25',
                    url: 'https://example.com/news-1',
                    sentiment: 'positive'
                }
            ],
            news_summary: {
                total_articles: 1,
                positive_percentage: 100,
                trend: 'GROWING'
            }
        },
        'paystack': {
            id: 'paystack-001',
            name: 'Paystack',
            cac_number: 'RC987654',
            industry: 'Financial Technology',
            location: 'Lagos, Nigeria',
            address: '22, Akin Olugbade Street, Lagos',
            email: 'support@paystack.com',
            phone: '+234 700 000 0000',
            website: 'https://www.paystack.com',
            description: 'Africa\'s leading payment technology company',
            trust_score: 98,
            verification_status: 'verified',
            risk_level: 'low',
            founded: 2015,
            employees: 200,
            is_premium: true,
            news: [],
            news_summary: {
                total_articles: 0,
                positive_percentage: 0,
                trend: 'STABLE'
            }
        }
    };

    const results = Object.values(mockCompanies).filter(company => 
        company.name.toLowerCase().includes(query) ||
        company.cac_number.toLowerCase().includes(query) ||
        company.email.toLowerCase().includes(query)
    );

    console.log(`✅ Found ${results.length} results for "${query}"`);
    res.json({
        success: true,
        results: results,
        total: results.length
    });
});

// ============ PAYSTACK PAYMENT ENDPOINTS ============

// INITIATE PAYMENT - Frontend calls this
app.post('/api/premium/initiate-payment', async (req, res) => {
    try {
        const { email, company_id, company_name, subscription_months = 1 } = req.body;
        
        console.log(`💳 Payment initiation request:`, {
            email,
            company_id,
            company_name,
            amount: appData.premium_monthly_price * subscription_months
        });

        if (!email || !company_id) {
            return res.status(400).json({ 
                success: false,
                error: 'Email and company_id required' 
            });
        }

        if (!PAYSTACK_SECRET) {
            return res.status(500).json({
                success: false,
                error: 'Paystack not configured. Contact administrator.'
            });
        }

        const amount = appData.premium_monthly_price * subscription_months * 100; // Paystack uses kobo

        // Call Paystack API to initialize transaction
        const paystackResponse = await axios.post(
            `${PAYSTACK_API}/transaction/initialize`,
            {
                email: email,
                amount: amount,
                metadata: {
                    company_id: company_id,
                    company_name: company_name,
                    subscription_months: subscription_months,
                    currency: appData.premium_currency
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Paystack API response:', paystackResponse.data.status);

        if (paystackResponse.data.status) {
            const authorization_url = paystackResponse.data.data.authorization_url;
            const reference = paystackResponse.data.data.reference;

            console.log(`🎯 Payment initialized - Reference: ${reference}`);

            // Store payment record
            payments.push({
                reference: reference,
                email: email,
                company_id: company_id,
                company_name: company_name,
                amount: appData.premium_monthly_price * subscription_months,
                status: 'pending',
                timestamp: new Date().toISOString()
            });

            res.json({
                success: true,
                message: 'Payment initialization successful',
                authorization_url: authorization_url,
                reference: reference
            });
        } else {
            throw new Error('Paystack initialization failed');
        }
    } catch (err) {
        console.error('❌ Payment initiation error:', err.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to initiate payment',
            details: err.message 
        });
    }
});

// VERIFY PAYMENT - Frontend calls this after payment
app.post('/api/premium/verify-payment', async (req, res) => {
    try {
        const { reference } = req.body;
        
        console.log(`🔐 Verifying payment: ${reference}`);

        if (!reference) {
            return res.status(400).json({ 
                success: false,
                error: 'Reference required' 
            });
        }

        if (!PAYSTACK_SECRET) {
            return res.status(500).json({
                success: false,
                error: 'Paystack not configured'
            });
        }

        // Call Paystack to verify
        const verifyResponse = await axios.get(
            `${PAYSTACK_API}/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`
                }
            }
        );

        const data = verifyResponse.data.data;
        console.log(`✅ Paystack verification status: ${data.status}`);

        if (data.status === 'success') {
            const paymentRecord = payments.find(p => p.reference === reference);
            
            if (paymentRecord) {
                paymentRecord.status = 'successful';
                const company_id = data.metadata.company_id;
                const company_name = data.metadata.company_name;

                // Mark company as premium
                if (!companies[company_id]) {
                    companies[company_id] = {};
                }
                companies[company_id].is_premium = true;
                companies[company_id].subscription_date = new Date().toISOString();
                companies[company_id].paystack_reference = reference;

                console.log(`✅ Company ${company_id} upgraded to premium!`);
            }

            res.json({
                success: true,
                message: 'Payment verified successfully',
                status: data.status,
                amount: data.amount / 100,
                reference: reference
            });
        } else {
            res.json({
                success: false,
                message: 'Payment verification failed',
                status: data.status,
                reference: reference
            });
        }
    } catch (err) {
        console.error('❌ Payment verification error:', err.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to verify payment',
            details: err.message 
        });
    }
});

// PAYSTACK WEBHOOK - Paystack calls this
app.post('/api/premium/paystack-webhook', (req, res) => {
    try {
        const event = req.body;
        console.log('🪝 Webhook received:', event.event);

        if (event.event === 'charge.success') {
            const reference = event.data.reference;
            const email = event.data.customer.email;
            
            console.log(`✅ Webhook: Payment successful for ${email} - ${reference}`);

            // Update payment record
            const paymentRecord = payments.find(p => p.reference === reference);
            if (paymentRecord) {
                paymentRecord.status = 'webhook_confirmed';
            }
        }

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('❌ Webhook error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ============ ADMIN COMPANIES ENDPOINTS ============
app.get('/api/admin/companies', verifyAdmin, (req, res) => {
    res.json({
        success: true,
        companies: Object.values(companies),
        total: Object.keys(companies).length
    });
});

app.post('/api/admin/companies/:id/upgrade', verifyAdmin, (req, res) => {
    try {
        const { id } = req.params;
        if (!companies[id]) {
            companies[id] = {};
        }
        companies[id].is_premium = true;
        console.log(`✅ Company ${id} upgraded to premium`);
        
        res.json({
            success: true,
            message: `Company ${id} upgraded to premium`
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to upgrade company', details: err.message });
    }
});

app.post('/api/admin/companies/:id/downgrade', verifyAdmin, (req, res) => {
    try {
        const { id } = req.params;
        if (companies[id]) {
            companies[id].is_premium = false;
        }
        console.log(`✅ Company ${id} downgraded`);
        
        res.json({
            success: true,
            message: `Company ${id} downgraded`
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to downgrade company', details: err.message });
    }
});

// ============ ADMIN PAYMENTS ENDPOINT ============
app.get('/api/admin/payments', verifyAdmin, (req, res) => {
    const revenue = payments
        .filter(p => p.status === 'successful' || p.status === 'webhook_confirmed')
        .reduce((sum, p) => sum + (p.amount || 0), 0);

    res.json({
        success: true,
        payments: payments,
        total: payments.length,
        revenue: revenue,
        currency: appData.premium_currency
    });
});

// ============ EMAIL SIGNUP ENDPOINT ============
app.post('/api/email-signup', (req, res) => {
    try {
        const { name, email, userType, signupDate } = req.body;
        console.log(`📧 Signup: ${name} (${email}) - Type: ${userType}`);

        if (!email || !name) {
            return res.status(400).json({ error: 'Name and email required' });
        }

        res.json({
            success: true,
            message: 'Signup successful',
            data: { name, email, userType, signupDate }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to process signup', details: err.message });
    }
});

// ============ 404 HANDLER ============
app.use((req, res) => {
    console.log(`⚠️ 404 - Not found: ${req.method} ${req.path}`);
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 BrandsTrack Backend v3.0 RUNNING WITH PAYSTACK`);
    console.log(`💳 Paystack Integration: ACTIVE`);
    console.log(`📊 Current Premium Price: ₦${appData.premium_monthly_price}`);
    console.log(`\n✅ Endpoints:`);
    console.log(`   GET /health`);
    console.log(`   GET /api/settings/public`);
    console.log(`   POST /api/premium/initiate-payment`);
    console.log(`   POST /api/premium/verify-payment`);
    console.log(`   GET /api/admin/payments (auth)`);
    console.log(`\n⏱️ Port: ${PORT}\n`);
});

module.exports = app;
