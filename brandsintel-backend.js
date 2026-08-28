// ============ BRANDSTRACK BACKEND - SIMPLE & WORKING (AUGUST 28 2026) ============
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ ADMIN KEY ============
const ADMIN_PASSWORD = 'BrandsIntel2024';

// ============ APP DATA ============
let appData = {
    free_searches_per_day: 3,
    premium_monthly_price: 30000,
};

// ============ MOCK COMPANIES ============
const mockCompanies = [
    {
        id: 1, name: 'Konga', industry: 'E-commerce', cac_number: 'CAC-BN-12345',
        trust_score: 94, address: '123 Lekki Phase 1, Lagos', email: 'contact@konga.com',
        phone: '+234 800 123 4567', website: 'https://www.konga.com', employees: 500, founded: 2012,
        risk_level: 'low', trend: 'Growing', description: 'Leading Nigerian e-commerce',
        news: [{ title: 'Konga expands', source: 'TechCrunch', published_date: '2026-08-25', sentiment: 'positive', url: 'https://techcrunch.com/konga' }],
        is_premium: false
    },
    {
        id: 2, name: 'MTN Nigeria', industry: 'Telecommunications', cac_number: 'CAC-BN-77777',
        trust_score: 97, address: '161 Lekki-Epe Expressway', email: 'contact@mtn.com.ng',
        phone: '+234 803 001 0001', website: 'https://www.mtn.com.ng', employees: 5000, founded: 2001,
        risk_level: 'low', trend: 'Stable', description: 'Major telecom provider',
        news: [{ title: 'MTN launches 5G', source: 'Premium Times', published_date: '2026-08-22', sentiment: 'positive', url: 'https://premiumtimesng.com/mtn' }],
        is_premium: false
    },
    {
        id: 3, name: 'Jumia Nigeria', industry: 'E-commerce', cac_number: 'CAC-BN-88888',
        trust_score: 98, address: '72 Moromoke Street, Yaba', email: 'support@jumia.com.ng',
        phone: '+234 700 600 0000', website: 'https://www.jumia.com.ng', employees: 800, founded: 2012,
        risk_level: 'low', trend: 'Growing', description: 'Africa e-commerce leader',
        news: [{ title: 'Jumia wins award', source: 'African Tech', published_date: '2026-08-24', sentiment: 'positive', url: 'https://africantechtoday.com/jumia' }],
        is_premium: true
    },
    {
        id: 4, name: 'Paystack', industry: 'Fintech', cac_number: 'CAC-BN-54321',
        trust_score: 96, address: '456 Innovation Hub', email: 'hello@paystack.com',
        phone: '+234 700 933 3366', website: 'https://www.paystack.com', employees: 200, founded: 2015,
        risk_level: 'low', trend: 'Growing', description: 'African payments',
        news: [{ title: 'Paystack funding', source: 'TechCrunch', published_date: '2026-08-15', sentiment: 'positive', url: 'https://techcrunch.com/paystack' }],
        is_premium: true
    },
    {
        id: 5, name: 'Golden Hospital', industry: 'Healthcare', cac_number: 'CAC-BN-99999',
        trust_score: 92, address: '15 Crescent Road, Ikoyi', email: 'info@goldenhospital.com',
        phone: '+234 803 456 7890', website: 'https://www.goldenhospital.com', employees: 150, founded: 2008,
        risk_level: 'low', trend: 'Stable', description: 'Private healthcare',
        news: [{ title: 'Hospital expansion', source: 'Health News', published_date: '2026-08-10', sentiment: 'positive', url: 'https://healthnewsng.com/golden' }],
        is_premium: false
    }
];

// ============ PREMIUM BRANDS & PAYMENTS ============
let premiumBrands = {
    all: [
        { id: 1, company_name: 'Paystack', cac_number: 'CAC-BN-54321', industry: 'Fintech', email: 'hello@paystack.com', phone: '+234 700 933 3366', status: 'approved', submitted_date: new Date().toISOString(), monthly_price: 2000 },
        { id: 2, company_name: 'Jumia Nigeria', cac_number: 'CAC-BN-88888', industry: 'E-commerce', email: 'support@jumia.com.ng', phone: '+234 700 600 0000', status: 'approved', submitted_date: new Date().toISOString(), monthly_price: 2000 },
        { id: 3, company_name: 'MTN Nigeria', cac_number: 'CAC-BN-77777', industry: 'Telecommunications', email: 'contact@mtn.com.ng', phone: '+234 803 001 0001', status: 'pending', submitted_date: new Date().toISOString(), monthly_price: 2000 }
    ],
    featured: [1, 2]
};

let paymentTransactions = [
    { id: 'TXN_001', reference: 'TXN_20260828_001', email: 'hello@paystack.com', amount: 2000, type: 'Premium Brand', status: 'success', date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), company_name: 'Paystack' },
    { id: 'TXN_002', reference: 'TXN_20260827_001', email: 'support@jumia.com.ng', amount: 2000, type: 'Premium Brand', status: 'success', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), company_name: 'Jumia Nigeria' },
    { id: 'TXN_003', reference: 'TXN_20260826_001', email: 'user@example.com', amount: 30000, type: 'Premium User', status: 'success', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), company_name: 'N/A' }
];

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
    console.log('✅ /health - OK');
    res.json({ status: 'ok', version: '3.2', timestamp: new Date().toISOString() });
});

// ============ PUBLIC SETTINGS ============
app.get('/api/settings/public', (req, res) => {
    console.log('✅ /api/settings/public');
    res.json({ 
        success: true, 
        settings: {
            premium_monthly_price: appData.premium_monthly_price || 30000,
            free_searches_per_day: appData.free_searches_per_day || 3,
        }
    });
});

// ============ SEARCH ============
app.get('/api/companies/search', (req, res) => {
    const { q } = req.query;
    console.log('✅ /api/companies/search - Query:', q);
    
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

// ============ ADMIN AUTH CHECK ============
const requireAdmin = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    console.log('🔐 Admin Key Check:', key ? '****' : 'MISSING');
    
    if (key !== ADMIN_PASSWORD) {
        console.log('❌ Admin auth failed');
        return res.status(401).json({ success: false, error: 'Unauthorized - Invalid admin key' });
    }
    next();
};

// ============ ADMIN SETTINGS ============
app.get('/api/admin/settings', requireAdmin, (req, res) => {
    console.log('✅ /api/admin/settings');
    res.json({ success: true, settings: appData });
});

app.post('/api/admin/settings/update', requireAdmin, (req, res) => {
    console.log('✅ /api/admin/settings/update');
    const { premium_monthly_price, free_searches_per_day } = req.body;
    if (premium_monthly_price) appData.premium_monthly_price = premium_monthly_price;
    if (free_searches_per_day) appData.free_searches_per_day = free_searches_per_day;
    res.json({ success: true, settings: appData });
});

// ============ ADMIN COMPANIES ============
app.get('/api/admin/companies', requireAdmin, (req, res) => {
    console.log('✅ /api/admin/companies');
    res.json({ success: true, companies: mockCompanies });
});

app.post('/api/admin/companies/:id/upgrade', requireAdmin, (req, res) => {
    console.log('✅ /api/admin/companies/:id/upgrade - ID:', req.params.id);
    const company = mockCompanies.find(c => c.id === parseInt(req.params.id));
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    company.is_premium = true;
    res.json({ success: true, company });
});

app.post('/api/admin/companies/:id/downgrade', requireAdmin, (req, res) => {
    console.log('✅ /api/admin/companies/:id/downgrade - ID:', req.params.id);
    const company = mockCompanies.find(c => c.id === parseInt(req.params.id));
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    company.is_premium = false;
    res.json({ success: true, company });
});

// ============ PREMIUM BRANDS ============
app.get('/api/admin/premium-brands/all', requireAdmin, (req, res) => {
    console.log('✅ /api/admin/premium-brands/all');
    res.json({ 
        success: true, 
        brands: premiumBrands.all,
        featured_ids: premiumBrands.featured,
        total_slots: 8,
        used_slots: premiumBrands.featured.length
    });
});

app.post('/api/admin/premium-brands/:id/feature', requireAdmin, (req, res) => {
    const brandId = parseInt(req.params.id);
    console.log('✅ /api/admin/premium-brands/:id/feature - ID:', brandId);
    
    if (premiumBrands.featured.length >= 8) {
        return res.status(400).json({ success: false, error: 'Featured slots full (max 8)' });
    }
    if (!premiumBrands.featured.includes(brandId)) {
        premiumBrands.featured.push(brandId);
    }
    res.json({ success: true, featured: premiumBrands.featured });
});

app.post('/api/admin/premium-brands/:id/unfeature', requireAdmin, (req, res) => {
    const brandId = parseInt(req.params.id);
    console.log('✅ /api/admin/premium-brands/:id/unfeature - ID:', brandId);
    
    premiumBrands.featured = premiumBrands.featured.filter(b => b !== brandId);
    res.json({ success: true, featured: premiumBrands.featured });
});

// ============ PUBLIC FEATURED BRANDS ============
app.get('/api/premium-brand/active', (req, res) => {
    console.log('✅ /api/premium-brand/active');
    const featured = premiumBrands.all.filter(b => premiumBrands.featured.includes(b.id));
    res.json({
        success: true,
        brands: featured,
        total_slots: 8,
        used_slots: premiumBrands.featured.length
    });
});

// ============ PAYMENTS ============
app.get('/api/admin/payments', requireAdmin, (req, res) => {
    console.log('✅ /api/admin/payments');
    const total = paymentTransactions.reduce((sum, t) => sum + t.amount, 0);
    res.json({ 
        success: true, 
        transactions: paymentTransactions,
        total: paymentTransactions.length,
        total_revenue: total
    });
});

app.post('/api/admin/payments/record', requireAdmin, (req, res) => {
    console.log('✅ /api/admin/payments/record');
    const { reference, email, amount, type, company_name, status } = req.body;
    const transaction = {
        id: 'TXN_' + Date.now(),
        reference: reference || 'TXN_' + Date.now(),
        email, amount, type,
        status: status || 'success',
        date: new Date().toISOString(),
        company_name: company_name || 'N/A'
    };
    paymentTransactions.push(transaction);
    res.json({ success: true, transaction });
});

// ============ 404 & ERROR ============
app.use((req, res) => {
    console.log('❌ 404:', req.path);
    res.status(404).json({ success: false, error: 'Endpoint not found', path: req.path });
});

app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(500).json({ success: false, error: 'Server error', message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n✅ BrandsTrack Backend v3.2 - READY\n🔐 Admin Key: BrandsIntel2024\n📡 Port: ${PORT}\n`);
});

module.exports = app;
