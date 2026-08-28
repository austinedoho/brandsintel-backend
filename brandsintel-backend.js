// ============ IMPORTS ============
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const twilio = require('twilio');
const axios = require('axios');

// ============ CONFIG ============
const app = express();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'BrandsIntel2024';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '360cee0702dd4e5589f019d6f5033760';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET || 'sk_live_e68e95f7aaf1953b57182098ecbd554ab0a7eef0';
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC || 'pk_live_f50aba470014c265bac4a6e2697149136638c76f';
const TWILIO_SID = process.env.TWILIO_SID || 'ACf5640041b8cc03f0068dec624c806797';
const TWILIO_TOKEN = process.env.TWILIO_TOKEN || 'b8800271b597eeb8b4aa307694cdeefb';
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://edgxorvnddazggvrxixs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ3hvcnZuZGRhemdndnJ4aXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk3MzA4NzUsImV4cCI6MjAyNTMwNjg3NX0.0d36Ay1g45_b0iI_VvLx2OJx24Iq_9iq1hgV9aZCn_w';

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

// ============ PREMIUM BRAND ROUTES ============
const premiumBrandRoutes = require('./premium-brands-backend-routes.js');

// ============ CORS ============
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
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

// ============ SEARCH COMPANIES ============
app.get('/api/companies/search', async (req, res) => {
    const { q, email } = req.query;

    if (!q) return res.status(400).json({ error: 'Query required' });

    try {
        const isPremium = email && premiumUsers[email];
        
        const { data: companies, error } = await supabase
            .from('companies')
            .select('*')
            .ilike('name', `%${q}%`)
            .limit(5);

        if (error) throw error;

        const results = companies.map(c => ({
            name: c.name,
            industry: c.industry,
            cac_number: c.cac_number,
            address: c.address,
            trust_score: c.trust_score || 0,
            news: c.news || []
        }));

        res.json({
            success: true,
            results,
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
            companies: companies || []
        });
    } catch (err) {
        console.error('Error fetching companies:', err);
        res.status(500).json({ error: 'Failed to fetch companies' });
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

// ============ PREMIUM BRAND ROUTES (MUST BE BEFORE 404!) ============
app.use('/', premiumBrandRoutes);

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
    console.log(`👥 Premium Users: ${Object.keys(premiumUsers).length}`);
    console.log(`\n📡 Port: ${PORT}\n`);
});

module.exports = app;
