// ============ BRANDSTRACK BACKEND - FIXED FOR NODE.JS 22 (AUGUST 28 2026) ============
const express = require('express');
const app = express();

// Only use json middleware - remove urlencoded which is causing the error
app.use(express.json());

const ADMIN_PASSWORD = 'BrandsIntel2024';

// ============ DATA STORES ============
let appData = {
    free_searches_per_day: 3,
    premium_monthly_price: 30000,  // Premium User price (individuals)
    premium_brand_price: 2000,     // Premium Brand price (companies)
    articles_per_company: 5,
    premium_currency: 'NGN'
};

const mockCompanies = [
    {
        id: '1', name: 'Konga', industry: 'E-commerce', cac_number: 'CAC-BN-12345',
        trust_score: 94, address: '123 Lekki Phase 1, Lagos', email: 'contact@konga.com',
        phone: '+234 800 123 4567', website: 'https://www.konga.com', employees: 500, founded: 2012,
        risk_level: 'low', trend: 'Growing', description: 'Leading Nigerian e-commerce',
        news: [{ title: 'Konga expands', source: 'TechCrunch', published_date: '2026-08-25', sentiment: 'positive', url: 'https://techcrunch.com/konga' }],
        is_premium: false, subscription_end_date: null
    },
    {
        id: '2', name: 'MTN Nigeria', industry: 'Telecommunications', cac_number: 'CAC-BN-77777',
        trust_score: 97, address: '161 Lekki-Epe Expressway', email: 'contact@mtn.com.ng',
        phone: '+234 803 001 0001', website: 'https://www.mtn.com.ng', employees: 5000, founded: 2001,
        risk_level: 'low', trend: 'Stable', description: 'Major telecom provider',
        news: [{ title: 'MTN launches 5G', source: 'Premium Times', published_date: '2026-08-22', sentiment: 'positive', url: 'https://premiumtimesng.com/mtn' }],
        is_premium: false, subscription_end_date: null
    },
    {
        id: '3', name: 'Jumia Nigeria', industry: 'E-commerce', cac_number: 'CAC-BN-88888',
        trust_score: 98, address: '72 Moromoke Street, Yaba', email: 'support@jumia.com.ng',
        phone: '+234 700 600 0000', website: 'https://www.jumia.com.ng', employees: 800, founded: 2012,
        risk_level: 'low', trend: 'Growing', description: 'Africa e-commerce leader',
        news: [{ title: 'Jumia wins award', source: 'African Tech', published_date: '2026-08-24', sentiment: 'positive', url: 'https://africantechtoday.com/jumia' }],
        is_premium: true, subscription_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '4', name: 'Paystack', industry: 'Fintech', cac_number: 'CAC-BN-54321',
        trust_score: 96, address: '456 Innovation Hub', email: 'hello@paystack.com',
        phone: '+234 700 933 3366', website: 'https://www.paystack.com', employees: 200, founded: 2015,
        risk_level: 'low', trend: 'Growing', description: 'African payments',
        news: [{ title: 'Paystack funding', source: 'TechCrunch', published_date: '2026-08-15', sentiment: 'positive', url: 'https://techcrunch.com/paystack' }],
        is_premium: true, subscription_end_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '5', name: 'Golden Hospital', industry: 'Healthcare', cac_number: 'CAC-BN-99999',
        trust_score: 92, address: '15 Crescent Road, Ikoyi', email: 'info@goldenhospital.com',
        phone: '+234 803 456 7890', website: 'https://www.goldenhospital.com', employees: 150, founded: 2008,
        risk_level: 'low', trend: 'Stable', description: 'Private healthcare',
        news: [{ title: 'Hospital expansion', source: 'Health News', published_date: '2026-08-10', sentiment: 'positive', url: 'https://healthnewsng.com/golden' }],
        is_premium: false, subscription_end_date: null
    }
];

// Premium brand submissions & featured
let premiumBrandSubmissions = [
    {
        id: 'sub_001',
        company_name: 'Konga',
        cac_number: 'CAC-BN-12345',
        email: 'contact@konga.com',
        phone: '+234 800 123 4567',
        address: '123 Lekki Phase 1, Lagos',
        certificate_url: 'https://example.com/cert_konga.pdf',
        status: 'pending',
        submitted_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: 'sub_002',
        company_name: 'Golden Hospital',
        cac_number: 'CAC-BN-99999',
        email: 'info@goldenhospital.com',
        phone: '+234 803 456 7890',
        address: '15 Crescent Road, Ikoyi',
        certificate_url: 'https://example.com/cert_golden.pdf',
        status: 'pending',
        submitted_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    }
];

let featuredBrands = [
    { id: '4', company_name: 'Paystack', cac_number: 'CAC-BN-54321', industry: 'Fintech', email: 'hello@paystack.com', phone: '+234 700 933 3366' },
    { id: '3', company_name: 'Jumia Nigeria', cac_number: 'CAC-BN-88888', industry: 'E-commerce', email: 'support@jumia.com.ng', phone: '+234 700 600 0000' }
];

let paymentTransactions = [
    { id: 'txn_001', company_id: '4', amount: 2000, type: 'Premium Brand', status: 'success', created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'txn_002', company_id: '3', amount: 2000, type: 'Premium Brand', status: 'success', created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'txn_003', company_id: 'user_001', amount: 30000, type: 'Premium User', status: 'success', created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }
];

// ============ CORS & AUTH ============
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const requireAdmin = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
};

// ============ HEALTH ============
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '3.4', timestamp: new Date().toISOString() });
});

// ============ SETTINGS ============
app.get('/api/admin/settings', requireAdmin, (req, res) => {
    res.json({ success: true, settings: appData });
});

app.post('/api/admin/settings/update', requireAdmin, (req, res) => {
    const { premium_monthly_price, free_searches_per_day } = req.body;
    if (premium_monthly_price) appData.premium_monthly_price = premium_monthly_price;
    if (free_searches_per_day) appData.free_searches_per_day = free_searches_per_day;
    res.json({ success: true, settings: appData });
});

// ============ PUBLIC SETTINGS ============
app.get('/api/settings/public', (req, res) => {
    res.json({ 
        success: true, 
        settings: {
            premium_monthly_price: appData.premium_monthly_price,
            free_searches_per_day: appData.free_searches_per_day,
        }
    });
});

// ============ SEARCH ============
app.get('/api/companies/search', (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });

    const results = mockCompanies.filter(c => 
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.cac_number.toLowerCase().includes(q.toLowerCase())
    );

    res.json({
        success: true,
        results: results.map(c => ({
            id: c.id, name: c.name, industry: c.industry, cac_number: c.cac_number,
            trust_score: c.trust_score, address: c.address, email: c.email, phone: c.phone,
            website: c.website, employees: c.employees, founded: c.founded,
            risk_level: c.risk_level, trend: c.trend, description: c.description,
            news: c.news || [], is_premium: c.is_premium
        }))
    });
});

// ============ PREMIUM BRAND SUBMISSIONS ============
app.get('/api/admin/premium-brand/pending', requireAdmin, (req, res) => {
    const pending = premiumBrandSubmissions.filter(s => s.status === 'pending');
    res.json({ 
        success: true, 
        submissions: pending
    });
});

app.post('/api/admin/premium-brand/:submissionId/approve', requireAdmin, (req, res) => {
    const sub = premiumBrandSubmissions.find(s => s.id === req.params.submissionId);
    if (!sub) return res.status(404).json({ success: false, error: 'Submission not found' });
    
    sub.status = 'approved';
    if (!featuredBrands.find(b => b.company_name === sub.company_name)) {
        featuredBrands.push({
            id: 'brand_' + Date.now(),
            company_name: sub.company_name,
            cac_number: sub.cac_number,
            email: sub.email,
            phone: sub.phone
        });
    }
    
    res.json({ success: true, message: 'Premium brand approved', submission: sub });
});

app.post('/api/admin/premium-brand/:submissionId/reject', requireAdmin, (req, res) => {
    const sub = premiumBrandSubmissions.find(s => s.id === req.params.submissionId);
    if (!sub) return res.status(404).json({ success: false, error: 'Submission not found' });
    
    sub.status = 'rejected';
    sub.rejection_reason = req.body.reason || 'No reason provided';
    
    res.json({ success: true, message: 'Premium brand rejected', submission: sub });
});

// ============ FEATURED BRANDS ============
app.get('/api/admin/premium-brand/active', requireAdmin, (req, res) => {
    res.json({ 
        success: true, 
        brands: featuredBrands,
        total_slots: 8,
        used_slots: featuredBrands.length
    });
});

app.get('/api/premium-brand/active', (req, res) => {
    res.json({ 
        success: true, 
        brands: featuredBrands,
        total_slots: 8,
        used_slots: featuredBrands.length
    });
});

app.post('/api/admin/premium-brand/:brandId/unfeature', requireAdmin, (req, res) => {
    const idx = featuredBrands.findIndex(b => b.id === req.params.brandId);
    if (idx !== -1) {
        featuredBrands.splice(idx, 1);
    }
    res.json({ success: true, brands: featuredBrands });
});

app.post('/api/admin/premium-brand/:brandId/feature', requireAdmin, (req, res) => {
    if (featuredBrands.length >= 8) {
        return res.status(400).json({ success: false, error: 'Featured slots full' });
    }
    const brand = mockCompanies.find(c => c.id === req.params.brandId);
    if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
    
    if (!featuredBrands.find(b => b.id === brand.id)) {
        featuredBrands.push({
            id: brand.id,
            company_name: brand.name,
            cac_number: brand.cac_number,
            industry: brand.industry,
            email: brand.email,
            phone: brand.phone
        });
    }
    
    res.json({ success: true, brands: featuredBrands });
});

// ============ PAYMENTS ============
app.get('/api/admin/payments', requireAdmin, (req, res) => {
    const successful = paymentTransactions.filter(p => p.status === 'success').length;
    const failed = paymentTransactions.filter(p => p.status === 'failed').length;
    const total = paymentTransactions.reduce((sum, p) => sum + p.amount, 0);
    
    res.json({
        success: true,
        stats: {
            total_revenue: total,
            successful_payments: successful,
            failed_payments: failed
        },
        payments: paymentTransactions
    });
});

app.post('/api/admin/payments/record', requireAdmin, (req, res) => {
    const { reference, email, amount, type, company_id, status } = req.body;
    const transaction = {
        id: 'txn_' + Date.now(),
        reference: reference || 'txn_' + Date.now(),
        company_id: company_id || email,
        amount: amount || 0,
        type: type || 'Payment',
        status: status || 'success',
        created_at: new Date().toISOString()
    };
    paymentTransactions.push(transaction);
    res.json({ success: true, transaction });
});

// ============ COMPANIES ============
app.get('/api/admin/companies', requireAdmin, (req, res) => {
    res.json({ success: true, companies: mockCompanies });
});

app.post('/api/admin/companies/:companyId/upgrade', requireAdmin, (req, res) => {
    const company = mockCompanies.find(c => c.id === req.params.companyId);
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    
    company.is_premium = true;
    const months = req.body.subscription_months || 1;
    company.subscription_end_date = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
    
    res.json({ success: true, company });
});

app.post('/api/admin/companies/:companyId/downgrade', requireAdmin, (req, res) => {
    const company = mockCompanies.find(c => c.id === req.params.companyId);
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    
    company.is_premium = false;
    company.subscription_end_date = null;
    
    res.json({ success: true, company });
});

// ============ ERROR HANDLING ============
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found', path: req.path });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n✅ BrandsTrack Backend v3.4 - RUNNING ON PORT ${PORT}\n`);
});

module.exports = app;
