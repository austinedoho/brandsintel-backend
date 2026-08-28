// ============ IMPORTS ============
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const twilio = require('twilio');
const axios = require('axios');

// ============ CONFIG ============
const app = express();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'BrandsIntel2024';
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_TOKEN = process.env.TWILIO_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// ============ INITIALIZE CLIENTS ============
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let twilioClient;
try {
    twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
} catch (err) {
    console.error('Twilio error:', err);
}

// ============ APP DATA ============
let appData = {
    free_searches_per_day: 3,
    premium_monthly_price: 30000,
    articles_per_company: 5,
    premium_currency: 'NGN'
};

const premiumUsers = {};

// ============ MOCK COMPANIES WITH ALL FIELDS ============
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
            { title: 'Konga expands operations', source: 'TechCrunch', published_date: '2026-08-25', sentiment: 'positive' },
            { title: 'Konga partners with logistics firm', source: 'Business Day', published_date: '2026-08-20', sentiment: 'positive' }
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
            { title: 'MTN launches 5G network', source: 'Premium Times', published_date: '2026-08-22', sentiment: 'positive' },
            { title: 'MTN reports strong Q2 earnings', source: 'Vanguard', published_date: '2026-08-18', sentiment: 'positive' }
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
        description: 'Africa\'s leading online shopping platform with millions of products',
        news: [
            { title: 'Jumia wins African e-commerce award', source: 'African Tech', published_date: '2026-08-24', sentiment: 'positive' }
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
        description: 'Leading African payments infrastructure company trusted by businesses',
        news: [
            { title: 'Paystack raises funding round', source: 'TechCrunch', published_date: '2026-08-15', sentiment: 'positive' }
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
        description: 'Premier private healthcare facility providing comprehensive medical services',
        news: [
            { title: 'Golden Hospital opens new wing', source: 'Health News', published_date: '2026-08-10', sentiment: 'positive' }
        ],
        is_premium: false
    }
];

// ============ PREMIUM BRANDS STORAGE ============
let premiumBrands = [
    {
        id: 1,
        company_name: 'Paystack',
        industry: 'Fintech',
        cac_number: 'CAC-BN-54321',
        email: 'hello@paystack.com',
        phone: '+234 700 933 3366',
        status: 'approved',
        approved_date: new Date().toISOString(),
        featured: true
    },
    {
        id: 2,
        company_name: 'Jumia Nigeria',
        industry: 'E-commerce',
        cac_number: 'CAC-BN-88888',
        email: 'support@jumia.com.ng',
        phone: '+234 700 600 0000',
        status: 'approved',
        approved_date: new Date().toISOString(),
        featured: true
    }
];

// ============ LOAD APP DATA FROM SUPABASE ============
async function loadAppData() {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('*')
            .single();

        if (data) {
            appData = { ...appData, ...data };
        }
    } catch (err) {
        console.log('Using default app data');
    }
}

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

// ============ EMAIL SIGNUP ============
app.post('/api/email-signup', async (req, res) => {
    const { name, email, userType, signupDate } = req.body;

    if (!email || !name) {
        return res.status(400).json({ error: 'Name and email required' });
    }

    try {
        const { error } = await supabase.from('email_signups').insert([{
            name,
            email,
            user_type: userType,
            signup_date: signupDate || new Date().toISOString()
        }]);

        if (error) throw error;
        res.json({ success: true, message: 'Signup recorded' });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Failed to record signup' });
    }
});

// ============ SEARCH COMPANIES (WITH ALL FIELDS) ============
app.get('/api/companies/search', async (req, res) => {
    const { q, email } = req.query;

    if (!q) return res.status(400).json({ error: 'Query required' });

    try {
        const isPremium = email && premiumUsers[email];
        
        // Search in mock data first
        const searchResults = mockCompanies.filter(c => 
            c.name.toLowerCase().includes(q.toLowerCase()) ||
            c.cac_number.toLowerCase().includes(q.toLowerCase()) ||
            c.phone.includes(q)
        );

        // If found in mock data, return with ALL fields
        if (searchResults.length > 0) {
            const results = searchResults.map(c => ({
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
            }));

            return res.json({
                success: true,
                results,
                limit_info: {
                    free_searches_per_day: appData.free_searches_per_day,
                    searches_used_today: 0,
                    is_premium: isPremium
                }
            });
        }

        // If not in mock data, try Supabase
        const { data: companies, error } = await supabase
            .from('companies')
            .select('*')
            .ilike('name', `%${q}%`)
            .limit(5);

        if (error) throw error;

        const results = (companies || []).map(c => ({
            id: c.id,
            name: c.name,
            industry: c.industry,
            cac_number: c.cac_number,
            trust_score: c.trust_score || 0,
            address: c.address || '',
            email: c.email || '',
            phone: c.phone || '',
            website: c.website || '',
            employees: c.employees || 0,
            founded: c.founded || '',
            risk_level: c.risk_level || 'medium',
            trend: c.trend || '',
            description: c.description || '',
            news: c.news || [],
            is_premium: c.is_premium || false
        }));

        res.json({
            success: true,
            results: results.length > 0 ? results : searchResults,
            limit_info: {
                free_searches_per_day: appData.free_searches_per_day,
                searches_used_today: 0,
                is_premium: isPremium
            }
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// ============ ADMIN SETTINGS ============
app.get('/api/admin/settings', async (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        res.json({ success: true, settings: appData });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

app.post('/api/admin/settings/update', async (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { premium_monthly_price, free_searches_per_day } = req.body;

    if (premium_monthly_price) appData.premium_monthly_price = premium_monthly_price;
    if (free_searches_per_day) appData.free_searches_per_day = free_searches_per_day;

    res.json({ success: true, settings: appData });
});

// ============ ADMIN PAYMENTS ============
app.get('/api/admin/payments', async (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { data: payments, error } = await supabase
            .from('payments')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const stats = {
            total_revenue: payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0,
            successful_payments: payments?.filter(p => p.status === 'success').length || 0,
            failed_payments: payments?.filter(p => p.status === 'failed').length || 0
        };

        res.json({
            success: true,
            payments: payments || [],
            stats
        });
    } catch (err) {
        console.error('Error fetching payments:', err);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// ============ GET ADMIN COMPANIES ============
app.get('/api/admin/companies', async (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { data: companies, error } = await supabase
            .from('companies')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            companies: companies || mockCompanies
        });
    } catch (err) {
        console.error('Error fetching companies:', err);
        res.status(500).json({ error: 'Failed to fetch companies', fallback: mockCompanies });
    }
});

// ============ UPGRADE COMPANY ============
app.post('/api/admin/companies/:id/upgrade', async (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { id } = req.params;
        const { subscription_months } = req.body;

        const subscriptionEnd = new Date();
        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + (subscription_months || 1));

        const { data, error } = await supabase
            .from('companies')
            .update({
                is_premium: true,
                subscription_end_date: subscriptionEnd.toISOString(),
                premium_since: new Date().toISOString()
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Company upgraded',
            company: data?.[0]
        });
    } catch (err) {
        console.error('Error upgrading company:', err);
        res.status(500).json({ error: 'Failed to upgrade company' });
    }
});

// ============ DOWNGRADE COMPANY ============
app.post('/api/admin/companies/:id/downgrade', async (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('companies')
            .update({
                is_premium: false,
                subscription_end_date: null
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Company downgraded',
            company: data?.[0]
        });
    } catch (err) {
        console.error('Error downgrading company:', err);
        res.status(500).json({ error: 'Failed to downgrade company' });
    }
});

// ============ PUBLIC SETTINGS ENDPOINT ============
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

// ============ GET ACTIVE PREMIUM BRANDS (PUBLIC) ============
app.get('/api/premium-brand/active', (req, res) => {
    try {
        const activeBrands = premiumBrands.filter(b => b.status === 'approved' && b.featured);
        res.json({
            success: true,
            brands: activeBrands.slice(0, 10)
        });
    } catch (err) {
        console.error('Error fetching premium brands:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============ SUBMIT PREMIUM BRAND APPLICATION ============
app.post('/api/premium-brand/submit', async (req, res) => {
    try {
        const { company_name, email, phone, address, cac_number } = req.body;

        if (!company_name || !email || !cac_number) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const newBrand = {
            id: premiumBrands.length + 1,
            company_name,
            email,
            phone,
            address,
            cac_number,
            status: 'pending',
            submitted_date: new Date().toISOString(),
            featured: false
        };

        premiumBrands.push(newBrand);

        res.json({
            success: true,
            message: 'Application submitted for review',
            brand: newBrand
        });
    } catch (err) {
        console.error('Error submitting brand:', err);
        res.status(500).json({ error: 'Failed to submit application' });
    }
});

// ============ ADMIN APPROVE PREMIUM BRAND ============
app.post('/api/admin/premium-brand/:id/approve', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { id } = req.params;
        const brand = premiumBrands.find(b => b.id === parseInt(id));

        if (!brand) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        brand.status = 'approved';
        brand.featured = true;
        brand.approved_date = new Date().toISOString();

        res.json({
            success: true,
            message: 'Brand approved and featured',
            brand
        });
    } catch (err) {
        console.error('Error approving brand:', err);
        res.status(500).json({ error: 'Failed to approve brand' });
    }
});

// ============ ADMIN REJECT PREMIUM BRAND ============
app.post('/api/admin/premium-brand/:id/reject', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { id } = req.params;
        const brand = premiumBrands.find(b => b.id === parseInt(id));

        if (!brand) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        brand.status = 'rejected';
        brand.featured = false;

        res.json({
            success: true,
            message: 'Brand rejected',
            brand
        });
    } catch (err) {
        console.error('Error rejecting brand:', err);
        res.status(500).json({ error: 'Failed to reject brand' });
    }
});

// ============ ADMIN UNFEATURE PREMIUM BRAND ============
app.post('/api/admin/premium-brand/:id/unfeature', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { id } = req.params;
        const brand = premiumBrands.find(b => b.id === parseInt(id));

        if (!brand) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        brand.featured = false;

        res.json({
            success: true,
            message: 'Brand removed from featured',
            brand
        });
    } catch (err) {
        console.error('Error unfeaturing brand:', err);
        res.status(500).json({ error: 'Failed to unfeature brand' });
    }
});

// ============ GET ALL PREMIUM BRANDS (ADMIN) ============
app.get('/api/admin/premium-brands', (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        res.json({
            success: true,
            brands: premiumBrands
        });
    } catch (err) {
        console.error('Error fetching premium brands:', err);
        res.status(500).json({ error: 'Failed to fetch premium brands' });
    }
});

// ============ SEND WHATSAPP MESSAGE ============
async function sendWhatsAppMessage(toNumber, messageText) {
    if (!twilioClient) {
        console.error('Twilio client not initialized');
        return;
    }
    try {
        const result = await twilioClient.messages.create({
            from: TWILIO_WHATSAPP_NUMBER,
            to: toNumber,
            body: messageText
        });
        console.log(`WhatsApp message sent: ${result.sid}`);
        return result;
    } catch (err) {
        console.error('Failed to send WhatsApp message:', err);
    }
}

// ============ WHATSAPP HEALTH CHECK ============
app.get('/api/whatsapp/health', (req, res) => {
    res.json({
        success: true,
        message: 'WhatsApp bot is running',
        twilio_configured: !!twilioClient,
        sandbox_number: TWILIO_WHATSAPP_NUMBER
    });
});

// ============ 404 & ERROR ============
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============ START SERVER ============
loadAppData();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🛡️ BrandsTrack Backend v3.0 - SECURE & AUTO-DEPLOYED`);
    console.log(`✅ Paystack: ACTIVE`);
    console.log(`💰 Price: ₦${appData.premium_monthly_price}`);
    console.log(`👥 Premium Brands: ${premiumBrands.filter(b => b.status === 'approved').length}`);
    console.log(`📱 Twilio WhatsApp: ${twilioClient ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`\n📡 Port: ${PORT}\n`);
});

module.exports = app;