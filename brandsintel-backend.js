require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const NewsAPI = require('newsapi');

const app = express();
const PORT = process.env.PORT || 10000;

// ============ ENVIRONMENT VARIABLES ============
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET || 'sk_live_your_key';
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC || 'pk_live_your_key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

// ============ INITIALIZE CLIENTS ============
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const newsapi = new NewsAPI(NEWS_API_KEY);

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ ADMIN AUTHENTICATION ============
const verifyAdmin = (req, res, next) => {
    const adminKey = req.headers['x-admin-key'] || req.body.admin_key;
    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid admin key' });
    }
    next();
};

// ============ DEFAULT SETTINGS ============
let SETTINGS = {
    premium_monthly_price: 30000,
    premium_currency: 'NGN',
    free_searches_per_day: 3,
    articles_per_company: 9,
    featured_listing_enabled: true,
    customer_reviews_enabled: true,
    api_access_enabled: false,
    fraud_response_enabled: false,
    certificate_download_enabled: true,
    priority_support_enabled: true,
};

// ============ LOAD SETTINGS FROM SUPABASE ============
async function loadSettings() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('key', 'app_settings')
            .single();
        
        if (!error && data) {
            SETTINGS = { ...SETTINGS, ...data.value };
            console.log('✅ Settings loaded from database');
        }
    } catch (err) {
        console.log('⚠️ Using default settings');
    }
}

loadSettings();

// ============ SAVE SETTINGS TO SUPABASE ============
async function saveSettings() {
    try {
        const { error } = await supabase
            .from('settings')
            .upsert({
                key: 'app_settings',
                value: SETTINGS,
                updated_at: new Date()
            }, { onConflict: 'key' });
        
        if (!error) {
            console.log('✅ Settings saved to database');
            return true;
        }
        return false;
    } catch (err) {
        console.error('Error saving settings:', err);
        return false;
    }
}

// ============ ADMIN: GET SETTINGS ============
app.get('/api/admin/settings', verifyAdmin, (req, res) => {
    res.json({
        success: true,
        settings: SETTINGS,
        timestamp: new Date()
    });
});

// ============ ADMIN: UPDATE SETTINGS ============
app.post('/api/admin/settings/update', verifyAdmin, async (req, res) => {
    try {
        const updates = req.body;
        
        // Update only provided fields
        Object.keys(updates).forEach(key => {
            if (key in SETTINGS) {
                SETTINGS[key] = updates[key];
            }
        });

        const saved = await saveSettings();
        
        res.json({
            success: saved,
            message: saved ? 'Settings updated successfully' : 'Error saving settings',
            settings: SETTINGS
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============ ADMIN: GET ALL COMPANIES ============
app.get('/api/admin/companies', verifyAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        res.json({
            success: true,
            companies: data || [],
            total: data?.length || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ ADMIN: UPDATE COMPANY ============
app.post('/api/admin/companies/:id/update', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const { error } = await supabase
            .from('companies')
            .update(updates)
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Company updated successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ ADMIN: UPGRADE COMPANY TO PREMIUM ============
app.post('/api/admin/companies/:id/upgrade', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { subscription_months = 1 } = req.body;

        const subscription_end = new Date();
        subscription_end.setMonth(subscription_end.getMonth() + subscription_months);

        const { error } = await supabase
            .from('companies')
            .update({
                is_premium: true,
                subscription_date: new Date(),
                subscription_end_date: subscription_end
            })
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Company upgraded to Premium',
            premium_until: subscription_end
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ ADMIN: DOWNGRADE COMPANY ============
app.post('/api/admin/companies/:id/downgrade', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('companies')
            .update({
                is_premium: false,
                subscription_date: null,
                subscription_end_date: null
            })
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Company downgraded to Free'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ ADMIN: GET PAYMENT LOGS ============
app.get('/api/admin/payments', verifyAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('payment_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const totalRevenue = data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const successCount = data?.filter(p => p.status === 'success').length || 0;
        const failureCount = data?.filter(p => p.status === 'failed').length || 0;

        res.json({
            success: true,
            payments: data || [],
            stats: {
                total_revenue: totalRevenue,
                successful_payments: successCount,
                failed_payments: failureCount,
                total_payments: data?.length || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ PAYSTACK: INITIATE PAYMENT ============
app.post('/api/premium/initiate-payment', async (req, res) => {
    try {
        const { email, company_id, company_name, subscription_months = 1 } = req.body;

        if (!email || !company_id) {
            return res.status(400).json({ error: 'Email and company_id required' });
        }

        const amount = SETTINGS.premium_monthly_price * subscription_months * 100;

        const paystack = await axios.post('https://api.paystack.co/transaction/initialize', {
            email,
            amount,
            metadata: {
                company_id,
                company_name,
                subscription_months,
                subscription_type: 'premium_seller'
            }
        }, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Paystack payment initialized:', paystack.data.data.reference);

        res.json({
            success: true,
            authorization_url: paystack.data.data.authorization_url,
            access_code: paystack.data.data.access_code,
            reference: paystack.data.data.reference,
            amount: amount / 100,
            currency: SETTINGS.premium_currency
        });
    } catch (err) {
        console.error('Paystack error:', err.response?.data || err.message);
        res.status(500).json({ 
            success: false, 
            error: err.response?.data?.message || 'Failed to initiate payment' 
        });
    }
});

// ============ PAYSTACK: VERIFY PAYMENT ============
app.post('/api/premium/verify-payment', async (req, res) => {
    try {
        const { reference } = req.body;

        if (!reference) {
            return res.status(400).json({ error: 'Reference required' });
        }

        const paystack = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`
                }
            }
        );

        const { status, data } = paystack.data;

        if (status && data.status === 'success') {
            const { company_id, subscription_months } = data.metadata;
            const subscription_end = new Date();
            subscription_end.setMonth(subscription_end.getMonth() + subscription_months);

            const { error: updateError } = await supabase
                .from('companies')
                .update({
                    is_premium: true,
                    subscription_date: new Date(),
                    subscription_end_date: subscription_end,
                    paystack_subscription_id: reference
                })
                .eq('id', company_id);

            if (!updateError) {
                await supabase
                    .from('payment_logs')
                    .insert({
                        company_id,
                        amount: data.amount / 100,
                        currency: data.currency,
                        status: 'success',
                        paystack_reference: reference,
                        subscription_months
                    });

                return res.json({
                    success: true,
                    message: 'Payment verified! Company upgraded to Premium',
                    company_id,
                    premium_until: subscription_end
                });
            }
        }

        res.status(400).json({ 
            success: false, 
            error: 'Payment verification failed' 
        });
    } catch (err) {
        console.error('Verification error:', err.response?.data || err.message);
        res.status(500).json({ 
            success: false, 
            error: 'Verification failed' 
        });
    }
});

// ============ PAYSTACK WEBHOOK ============
app.post('/api/premium/paystack-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const hash = require('crypto')
            .createHmac('sha512', PAYSTACK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const event = req.body;

        if (event.event === 'charge.success') {
            const { reference, metadata } = event.data;
            const { company_id, subscription_months } = metadata;

            const subscription_end = new Date();
            subscription_end.setMonth(subscription_end.getMonth() + subscription_months);

            await supabase
                .from('companies')
                .update({
                    is_premium: true,
                    subscription_date: new Date(),
                    subscription_end_date: subscription_end
                })
                .eq('id', company_id);

            console.log('✅ Webhook: Company upgraded to Premium');
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ============ GET PREMIUM STATUS ============
app.get('/api/premium/status/:company_id', async (req, res) => {
    try {
        const { company_id } = req.params;

        const { data, error } = await supabase
            .from('companies')
            .select('is_premium, subscription_end_date')
            .eq('id', company_id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const is_active = data.is_premium && new Date(data.subscription_end_date) > new Date();

        res.json({
            company_id,
            is_premium: is_active,
            subscription_end_date: data.subscription_end_date,
            days_remaining: is_active ? Math.ceil((new Date(data.subscription_end_date) - new Date()) / (1000 * 60 * 60 * 24)) : 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ SEARCH COMPANIES ============
app.get('/api/companies/search', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Search query required' });
        }

        const { data: companies, error } = await supabase
            .from('companies')
            .select('*')
            .or(`name.ilike.%${q}%,cac_number.ilike.%${q}%`)
            .order('trust_score', { ascending: false })
            .limit(10);

        if (error) throw error;

        const results = await Promise.all(companies.map(async (company) => {
            let news = [];
            let news_summary = {};

            try {
                const newsResponse = await newsapi.v2.everything({
                    q: company.name,
                    sortBy: 'publishedAt',
                    language: 'en',
                    pageSize: SETTINGS.articles_per_company
                });

                news = (newsResponse.articles || []).map(article => ({
                    title: article.title,
                    source: article.source.name,
                    url: article.url,
                    published_date: article.publishedAt,
                    sentiment: analyzeSentiment(article.title)
                }));

                const positive = news.filter(a => a.sentiment === 'positive').length;
                const positive_percentage = news.length > 0 ? Math.round((positive / news.length) * 100) : 0;

                news_summary = {
                    total_articles: news.length,
                    positive_percentage,
                    trend: determineTrend(positive_percentage)
                };
            } catch (newsErr) {
                console.log(`No news found for ${company.name}`);
            }

            return {
                ...company,
                news,
                news_summary,
                premium_price: SETTINGS.premium_monthly_price
            };
        }));

        res.json({ results });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ SENTIMENT ANALYSIS ============
function analyzeSentiment(text) {
    const positiveWords = ['growth', 'profit', 'success', 'leading', 'innovation', 'strong', 'improved'];
    const negativeWords = ['loss', 'decline', 'crisis', 'lawsuit', 'scandal', 'shutdown', 'layoff'];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
}

// ============ DETERMINE TREND ============
function determineTrend(positivePercentage) {
    if (positivePercentage >= 60) return 'GROWING';
    if (positivePercentage <= 30) return 'DECLINING';
    return 'STABLE';
}

// ============ EMAIL SIGNUP ============
app.post('/api/email-signup', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        const { error } = await supabase
            .from('email_signups')
            .insert({ email, signup_date: new Date() });

        if (error) {
            return res.status(400).json({ error: 'Email already subscribed or invalid' });
        }

        res.json({ success: true, message: 'Email subscribed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({
        status: '✅ OK',
        timestamp: new Date(),
        version: '3.0',
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

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log(`\n🚀 BrandsTrack Backend v3.0 running on port ${PORT}`);
    console.log(`📰 NEWS_API_KEY: ✅ Loaded`);
    console.log(`💳 PAYSTACK Integration: ✅ Ready`);
    console.log(`🎛️ Admin Dashboard: ✅ Fully Operational`);
    console.log(`💰 Premium Price: ₦${SETTINGS.premium_monthly_price}/month\n`);
});

module.exports = app;
