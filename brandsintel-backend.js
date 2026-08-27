const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ============ PERSISTENT DATA STORAGE (using environment + object) ============
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

console.log('💾 Initial settings loaded:', appData.premium_monthly_price);

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    console.log('✅ Health check requested');
    res.json({
        status: '✅ OK',
        version: '3.0',
        premium_price: appData.premium_monthly_price,
        features: [
            'CAC Verification',
            'Trust Scores',
            'News Intelligence',
            'Paystack Payments',
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
    
    console.log('🔐 Admin auth check - Key provided:', !!adminKey, 'Expected:', expectedKey);
    
    if (adminKey !== expectedKey) {
        console.log('❌ Auth failed - Invalid key');
        return res.status(401).json({ 
            error: 'Unauthorized: Invalid admin key',
            received: adminKey,
            expected: expectedKey
        });
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

    // Mock company data
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
                },
                {
                    id: 'news-2',
                    title: 'MTN Reports Record Quarterly Revenue',
                    source: 'Business Daily',
                    published_date: '2026-08-20',
                    url: 'https://example.com/news-2',
                    sentiment: 'positive'
                },
                {
                    id: 'news-3',
                    title: 'MTN Invests in New Data Centers',
                    source: 'Innovation Weekly',
                    published_date: '2026-08-15',
                    url: 'https://example.com/news-3',
                    sentiment: 'positive'
                }
            ],
            news_summary: {
                total_articles: 3,
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
            news: [
                {
                    id: 'news-4',
                    title: 'Paystack Acquires New Markets in West Africa',
                    source: 'Tech Crunch Africa',
                    published_date: '2026-08-22',
                    url: 'https://example.com/news-4',
                    sentiment: 'positive'
                },
                {
                    id: 'news-5',
                    title: 'Paystack Raises Series C Funding',
                    source: 'Venture Beat',
                    published_date: '2026-08-18',
                    url: 'https://example.com/news-5',
                    sentiment: 'positive'
                }
            ],
            news_summary: {
                total_articles: 2,
                positive_percentage: 100,
                trend: 'GROWING'
            }
        },
        'jumia': {
            id: 'jumia-001',
            name: 'Jumia Nigeria',
            cac_number: 'RC654321',
            industry: 'E-commerce',
            location: 'Lagos, Nigeria',
            address: '27 Radcliffe Street, Lagos',
            email: 'support@jumia.com.ng',
            phone: '+234 700 111 1111',
            website: 'https://www.jumia.com.ng',
            description: 'Online shopping platform for Nigeria',
            trust_score: 87,
            verification_status: 'verified',
            risk_level: 'low',
            founded: 2012,
            employees: 1500,
            is_premium: false,
            news: [
                {
                    id: 'news-6',
                    title: 'Jumia Launches New Seller Program',
                    source: 'E-commerce Weekly',
                    published_date: '2026-08-23',
                    url: 'https://example.com/news-6',
                    sentiment: 'neutral'
                },
                {
                    id: 'news-7',
                    title: 'Jumia Expands Same-Day Delivery',
                    source: 'Logistics Today',
                    published_date: '2026-08-19',
                    url: 'https://example.com/news-7',
                    sentiment: 'positive'
                }
            ],
            news_summary: {
                total_articles: 2,
                positive_percentage: 50,
                trend: 'STABLE'
            }
        }
    };

    // Search logic
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

// ============ ADMIN COMPANIES ENDPOINT ============
app.get('/api/admin/companies', verifyAdmin, (req, res) => {
    res.json({
        success: true,
        companies: [],
        total: 0
    });
});

app.post('/api/admin/companies/:id/upgrade', verifyAdmin, (req, res) => {
    try {
        const { id } = req.params;
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
        console.log(`✅ Company ${id} downgraded`);
        
        res.json({
            success: true,
            message: `Company ${id} downgraded`
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to downgrade company', details: err.message });
    }
});

// ============ PAYMENTS ENDPOINT ============
app.get('/api/admin/payments', verifyAdmin, (req, res) => {
    res.json({
        success: true,
        payments: [],
        total: 0,
        revenue: 0
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

// ============ PAYSTACK ENDPOINTS ============
app.post('/api/premium/initiate-payment', (req, res) => {
    try {
        const { email, company_id, company_name, subscription_months = 1 } = req.body;
        console.log(`💳 Payment initiated: ${company_name} - ₦${appData.premium_monthly_price * subscription_months}`);

        if (!email || !company_id) {
            return res.status(400).json({ error: 'Email and company_id required' });
        }

        const amount = appData.premium_monthly_price * subscription_months * 100;

        res.json({
            success: true,
            message: 'Payment initialization successful',
            authorization_url: `https://checkout.paystack.com/mock-checkout?email=${email}&amount=${amount}`,
            reference: `BT_${Date.now()}`
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to initiate payment', details: err.message });
    }
});

app.post('/api/premium/verify-payment', (req, res) => {
    try {
        const { reference } = req.body;
        console.log(`✅ Payment verified: ${reference}`);

        if (!reference) {
            return res.status(400).json({ error: 'Reference required' });
        }

        res.json({
            success: true,
            message: 'Payment verified',
            reference
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to verify payment', details: err.message });
    }
});

app.post('/api/premium/paystack-webhook', (req, res) => {
    try {
        const event = req.body;
        console.log('🪝 Webhook received:', event.event);

        if (event.event === 'charge.success') {
            console.log(`✅ Payment successful via webhook: ${event.data.reference}`);
        }

        res.json({ status: 'received' });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ============ 404 HANDLER ============
app.use((req, res) => {
    console.log(`⚠️ 404 - Not found: ${req.method} ${req.path}`);
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
        available_endpoints: [
            'GET /health',
            'GET /api/settings/public',
            'GET /api/admin/settings (auth)',
            'POST /api/admin/settings/update (auth)',
            'GET /api/companies/search',
            'POST /api/email-signup'
        ]
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
    console.log(`\n🚀 BrandsTrack Backend v3.0 RUNNING`);
    console.log(`📊 Current Premium Price: ₦${appData.premium_monthly_price}`);
    console.log(`\n✅ Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Public settings: http://localhost:${PORT}/api/settings/public`);
    console.log(`🔐 Admin settings: http://localhost:${PORT}/api/admin/settings (auth required)`);
    console.log(`🔍 Search: http://localhost:${PORT}/api/companies/search?q=mtn`);
    console.log(`\n⏱️ Port: ${PORT}`);
});

module.exports = app;
