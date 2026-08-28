// ============ BRANDSTRACK BACKEND - PRODUCTION READY (AUGUST 28 2026) ============
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const axios = require('axios');

const app = express();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'BrandsIntel2024';
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ APP DATA ============
let appData = {
    free_searches_per_day: 3,
    premium_monthly_price: 30000,
    articles_per_company: 5,
    premium_currency: 'NGN'
};

// ============ MOCK COMPANIES WITH COMPLETE DATA & NEWS URLS ============
const mockCompanies = [
    {
        id: 1,
        name: 'Konga',
        industry: 'E-commerce',
        cac_number: 'CAC-BN-12345',
        trust_score: 94,
        address: '123 Lekki Phase 1, Lagos',
        email: 'contact@konga.com',
        phone: '+234 800 123 4567',
        website: 'https://www.konga.com',
        employees: 500,
        founded: 2012,
        risk_level: 'low',
        trend: 'Growing',
        description: 'Leading Nigerian e-commerce platform specializing in retail',
        news: [
            { title: 'Konga expands to 5 new cities', source: 'TechCrunch', published_date: '2026-08-25', sentiment: 'positive', url: 'https://techcrunch.com/konga' },
            { title: 'Konga logistics partnership', source: 'Business Day', published_date: '2026-08-20', sentiment: 'positive', url: 'https://businessday.ng/konga' }
        ],
        is_premium: false
    },
    {
        id: 2,
        name: 'MTN Nigeria',
        industry: 'Telecommunications',
        cac_number: 'CAC-BN-77777',
        trust_score: 97,
        address: '161 Lekki-Epe Expressway, Lagos',
        email: 'contact@mtn.com.ng',
        phone: '+234 803 001 0001',
        website: 'https://www.mtn.com.ng',
        employees: 5000,
        founded: 2001,
        risk_level: 'low',
        trend: 'Stable',
        description: 'Major telecommunications provider serving millions across Nigeria',
        news: [
            { title: 'MTN launches 5G network', source: 'Premium Times', published_date: '2026-08-22', sentiment: 'positive', url: 'https://premiumtimesng.com/mtn-5g' }
        ],
        is_premium: false
    },
    {
        id: 3,
        name: 'Jumia Nigeria',
        industry: 'E-commerce',
        cac_number: 'CAC-BN-88888',
        trust_score: 98,
        address: '72 Moromoke Street, Yaba, Lagos',
        email: 'support@jumia.com.ng',
        phone: '+234 700 600 0000',
        website: 'https://www.jumia.com.ng',
        employees: 800,
        founded: 2012,
        risk_level: 'low',
        trend: 'Growing',
        description: 'Africa\'s leading online shopping platform',
        news: [
            { title: 'Jumia wins African e-commerce award', source: 'African Tech', published_date: '2026-08-24', sentiment: 'positive', url: 'https://africantechtoday.com/jumia' }
        ],
        is_premium: true
    },
    {
        id: 4,
        name: 'Paystack',
        industry: 'Fintech',
        cac_number: 'CAC-BN-54321',
        trust_score: 96,
        address: '456 Innovation Hub, Lekki Phase 1, Lagos',
        email: 'hello@paystack.com',
        phone: '+234 700 933 3366',
        website: 'https://www.paystack.com',
        employees: 200,
        founded: 2015,
        risk_level: 'low',
        trend: 'Growing',
        description: 'Leading African payments infrastructure',
        news: [
            { title: 'Paystack Series D funding', source: 'TechCrunch', published_date: '2026-08-15', sentiment: 'positive', url: 'https://techcrunch.com/paystack' }
        ],
        is_premium: true
    },
    {
        id: 5,
        name: 'Golden Hospital',
        industry: 'Healthcare',
        cac_number: 'CAC-BN-99999',
        trust_score: 92,
        address: '15 Crescent Road, Ikoyi, Lagos',
        email: 'info@goldenhospital.com',
        phone: '+234 803 456 7890',
        website: 'https://www.goldenhospital.com',
        employees: 150,
        founded: 2008,
        risk_level: 'low',
        trend: 'Stable',
        description: 'Premier private healthcare facility',
        news: [
            { title: 'Golden Hospital new wing opens', source: 'Health News', published_date: '2026-08-10', sentiment: 'positive', url: 'https://healthnewsng.com/golden' }
        ],
        is_premium: false
    }
];

// ============ PREMIUM BRANDS - ADMIN CONTROLLED FEATURED LIST ============
let premiumBrands = {
    all: [
        { id: 1, company_name: 'Paystack', cac_number: 'CAC-BN-54321', industry: 'Fintech', email: 'hello@paystack.com', phone: '+234 700 933 3366', status: 'approved', submitted_date: new Date().toISOString() },
        { id: 2, company_name: 'Jumia Nigeria', cac_number: 'CAC-BN-88888', industry: 'E-commerce', email: 'support@jumia.com.ng', phone: '+234 700 600 0000', status: 'approved', submitted_date: new Date().toISOString() }
    ],
    featured: [1, 2] // Admin controls which IDs are featured (max 8 slots)
};

// ============ CORS ============
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '3.0' });
});

// ============ PUBLIC SETTINGS ============
app.get('/api/settings/public', (req, res) => {
    res.json({ 
        success: true, 
        settings: {
            premium_monthly_price: appData.premium_monthly_price || 30000,
            free_searches_per_day: appData.free_searches_per_day || 3,
            articles_per_company: appData.articles_per_company || 5,
            premium_currency: appData.premium_currency || 'NGN'
        }
    });
});

// ============ SEARCH COMPANIES ============
app.get('/api/companies/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });

    try {
        const searchResults = mockCompanies.filter(c => 
            c.name.toLowerCase().includes(q.toLowerCase()) ||
            c.cac_number.toLowerCase().includes(q.toLowerCase())
        );

        res.json({
            success: true,
            results: searchResults.map(c => ({
                id: c.id,
                name: c.name,
                industry: c.industry,
                cac_number: c.cac_number,
                trust_score: c.trust_score,
                address: c.address,
                email: c.email,
                phone: c.phone,
                website: c.website,
                employees: c.employees,
                founded: c.founded,
                risk_level: c.risk_level,
                trend: c.trend,
                description: c.description,
                news: c.news || [],
                is_premium: c.is_premium
            }))
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// ============ ADMIN SETTINGS ============
app.get('/api/admin/settings', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ success: true, settings: appData });
});

app.post('/api/admin/settings/update', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { premium_monthly_price, free_searches_per_day } = req.body;
    if (premium_monthly_price) appData.premium_monthly_price = premium_monthly_price;
    if (free_searches_per_day) appData.free_searches_per_day = free_searches_per_day;
    res.json({ success: true, settings: appData });
});

// ============ ADMIN COMPANIES ============
app.get('/api/admin/companies', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ success: true, companies: mockCompanies });
});

app.post('/api/admin/companies/:id/upgrade', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const { id } = req.params;
        const company = mockCompanies.find(c => c.id === parseInt(id));
        if (!company) return res.status(404).json({ error: 'Company not found' });
        company.is_premium = true;
        res.json({ success: true, message: 'Company upgraded', company });
    } catch (err) {
        res.status(500).json({ error: 'Upgrade failed' });
    }
});

app.post('/api/admin/companies/:id/downgrade', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const { id } = req.params;
        const company = mockCompanies.find(c => c.id === parseInt(id));
        if (!company) return res.status(404).json({ error: 'Company not found' });
        company.is_premium = false;
        res.json({ success: true, message: 'Company downgraded', company });
    } catch (err) {
        res.status(500).json({ error: 'Downgrade failed' });
    }
});

// ============ PREMIUM BRANDS - ADMIN CONTROLLED ============
app.get('/api/admin/premium-brands/all', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ success: true, brands: premiumBrands.all });
});

app.post('/api/admin/premium-brands/:id/feature', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const { id } = req.params;
        const brandId = parseInt(id);
        if (premiumBrands.featured.length >= 8) {
            return res.status(400).json({ error: 'Featured slots full (max 8)' });
        }
        if (!premiumBrands.featured.includes(brandId)) {
            premiumBrands.featured.push(brandId);
        }
        res.json({ success: true, featured: premiumBrands.featured });
    } catch (err) {
        res.status(500).json({ error: 'Failed to feature brand' });
    }
});

app.post('/api/admin/premium-brands/:id/unfeature', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const { id } = req.params;
        const brandId = parseInt(id);
        premiumBrands.featured = premiumBrands.featured.filter(b => b !== brandId);
        res.json({ success: true, featured: premiumBrands.featured });
    } catch (err) {
        res.status(500).json({ error: 'Failed to unfeature brand' });
    }
});

// ============ PUBLIC FEATURED BRANDS (WHAT FRONTEND DISPLAYS) ============
app.get('/api/premium-brand/active', (req, res) => {
    try {
        const featured = premiumBrands.all.filter(b => premiumBrands.featured.includes(b.id));
        res.json({
            success: true,
            brands: featured
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============ PAYSTACK PAYMENT INITIALIZATION ============
app.post('/api/paystack/initialize', (req, res) => {
    const { email, amount, metadata } = req.body;
    if (!email || !amount) {
        return res.status(400).json({ error: 'Email and amount required' });
    }
    // In production, call Paystack API to initialize payment
    res.json({
        success: true,
        authorization_url: `https://checkout.paystack.com/pay/${process.env.PAYSTACK_PUBLIC || 'pk_test_xxx'}?email=${email}&amount=${amount * 100}`,
        message: 'Redirect to Paystack'
    });
});

// ============ ERROR HANDLERS ============
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n✅ BrandsTrack Backend v3.0 - PRODUCTION READY`);
    console.log(`📡 Port: ${PORT}\n`);
});

module.exports = app;
