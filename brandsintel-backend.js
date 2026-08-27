const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ============ PAYSTACK CONFIGURATION ============
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC;
const PAYSTACK_API = 'https://api.paystack.co';

if (!PAYSTACK_SECRET) {
    console.error('❌ ERROR: PAYSTACK_SECRET not set!');
}

console.log('🔑 Paystack configured from environment');

// ============ DATA STORAGE ============
let appData = {
    premium_monthly_price: parseInt(process.env.PREMIUM_PRICE || '30000'),
    premium_currency: 'NGN',
    free_searches_per_day: 3,
    articles_per_company: 9
};

let payments = [];
let companies = {};
let searchTracks = {}; // { "ip": { date, count } }
let premiumUsers = {}; // { "email@example.com": { paid: true, until: "2026-09-27" } }

console.log('💾 Initial settings loaded:', appData.premium_monthly_price);

// ============ PREMIUM USER TRACKING ============
function isPremiumUser(email) {
    if (!email) return false;
    const user = premiumUsers[email.toLowerCase()];
    if (!user) return false;
    
    // Check if subscription is still valid
    if (user.until && new Date(user.until) < new Date()) {
        delete premiumUsers[email.toLowerCase()];
        return false;
    }
    return true;
}

function markUserAsPremium(email, subscriptionMonths = 1) {
    if (!email) return false;
    
    const until = new Date();
    until.setMonth(until.getMonth() + subscriptionMonths);
    
    premiumUsers[email.toLowerCase()] = {
        paid: true,
        subscription_date: new Date().toISOString(),
        until: until.toISOString(),
        email: email
    };
    
    console.log(`✅ Marked ${email} as premium until ${until.toISOString()}`);
    return true;
}

// ============ SEARCH LIMIT FUNCTIONS ============
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress || 'unknown';
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function checkSearchLimit(req, email) {
    // ✅ PREMIUM USERS GET UNLIMITED SEARCHES
    if (email && isPremiumUser(email)) {
        console.log(`✅ Premium user ${email} - unlimited searches`);
        return {
            allowed: true,
            remaining: Infinity,
            total: Infinity,
            current: 0,
            isPremium: true
        };
    }
    
    const clientIP = getClientIP(req);
    const today = getTodayDate();
    
    if (!searchTracks[clientIP]) {
        searchTracks[clientIP] = { date: today, count: 0 };
    }
    
    if (searchTracks[clientIP].date !== today) {
        searchTracks[clientIP] = { date: today, count: 0 };
    }
    
    const allowedSearches = appData.free_searches_per_day;
    const currentCount = searchTracks[clientIP].count;
    
    return {
        allowed: currentCount < allowedSearches,
        remaining: Math.max(0, allowedSearches - currentCount),
        total: allowedSearches,
        current: currentCount,
        isPremium: false
    };
}

function incrementSearchCount(req) {
    const clientIP = getClientIP(req);
    const today = getTodayDate();
    
    if (!searchTracks[clientIP]) {
        searchTracks[clientIP] = { date: today, count: 0 };
    }
    
    if (searchTracks[clientIP].date !== today) {
        searchTracks[clientIP] = { date: today, count: 0 };
    }
    
    searchTracks[clientIP].count++;
}

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    res.json({
        status: '✅ OK',
        version: '3.0',
        premium_price: appData.premium_monthly_price,
        paystack: 'integrated',
        premium_users_tracked: Object.keys(premiumUsers).length
    });
});

// ============ PUBLIC SETTINGS ============
app.get('/api/settings/public', (req, res) => {
    res.json({
        success: true,
        settings: {
            premium_monthly_price: appData.premium_monthly_price,
            premium_currency: appData.premium_currency,
            free_searches_per_day: appData.free_searches_per_day,
            articles_per_company: appData.articles_per_company
        }
    });
});

// ============ ADMIN AUTHENTICATION ============
function verifyAdmin(req, res, next) {
    const adminKey = req.headers['x-admin-key'] || req.body.admin_key;
    const expectedKey = process.env.ADMIN_PASSWORD || 'BrandsIntel2024';
    
    if (adminKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ============ ADMIN SETTINGS ============
app.get('/api/admin/settings', verifyAdmin, (req, res) => {
    res.json({
        success: true,
        settings: appData
    });
});

app.post('/api/admin/settings/update', verifyAdmin, (req, res) => {
    try {
        const { premium_monthly_price, free_searches_per_day } = req.body;

        if (premium_monthly_price !== undefined) {
            appData.premium_monthly_price = premium_monthly_price;
        }
        if (free_searches_per_day !== undefined) {
            appData.free_searches_per_day = free_searches_per_day;
        }

        res.json({
            success: true,
            message: 'Settings updated',
            settings: appData
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ============ COMPANY SEARCH WITH RATE LIMIT ============
app.get('/api/companies/search', (req, res) => {
    const query = req.query.q?.toLowerCase() || '';
    const email = req.query.email || ''; // Optional: can pass email to check premium status

    console.log('🔍 Search query:', query, 'Email:', email);

    // ✅ CHECK SEARCH LIMIT (BUT SKIP FOR PREMIUM USERS)
    const searchLimit = checkSearchLimit(req, email);
    
    if (!searchLimit.allowed) {
        console.log(`❌ Search limit exceeded`);
        return res.status(429).json({ 
            success: false,
            error: '❌ Daily search limit exceeded!',
            message: `You have used all ${searchLimit.total} free searches today. Upgrade to Premium to get unlimited searches!`,
            limit_info: {
                free_searches_per_day: searchLimit.total,
                searches_used_today: searchLimit.current,
                searches_remaining: 0,
                reset_time: 'Tomorrow at 12:00 AM',
                isPremium: false
            }
        });
    }

    if (!query) {
        return res.json({ 
            success: false, 
            results: [],
            message: 'Please provide a search query'
        });
    }

    // ✅ INCREMENT SEARCH COUNT (ONLY IF NOT PREMIUM)
    if (!searchLimit.isPremium) {
        incrementSearchCount(req);
    }

    const mockCompanies = {
        'mtn': {
            id: 'mtn-001',
            name: 'MTN Nigeria',
            cac_number: 'RC123456',
            industry: 'Telecommunications',
            trust_score: 95,
            is_premium: false
        },
        'paystack': {
            id: 'paystack-001',
            name: 'Paystack',
            cac_number: 'RC987654',
            industry: 'FinTech',
            trust_score: 98,
            is_premium: true
        }
    };

    const results = Object.values(mockCompanies).filter(company => 
        company.name.toLowerCase().includes(query) ||
        company.cac_number.toLowerCase().includes(query)
    );

    res.json({
        success: true,
        results: results,
        total: results.length,
        limit_info: {
            searches_used_today: searchLimit.current + (searchLimit.isPremium ? 0 : 1),
            searches_remaining: Math.max(0, searchLimit.remaining - 1),
            free_searches_per_day: searchLimit.total,
            isPremium: searchLimit.isPremium
        }
    });
});

// ============ PAYSTACK PAYMENT ENDPOINTS ============
app.post('/api/premium/initiate-payment', async (req, res) => {
    try {
        const { email, subscription_months = 1 } = req.body;

        if (!email) {
            return res.status(400).json({ 
                success: false,
                error: 'Email required' 
            });
        }

        if (!PAYSTACK_SECRET) {
            return res.status(500).json({
                success: false,
                error: 'Paystack not configured'
            });
        }

        const amount = appData.premium_monthly_price * subscription_months * 100;

        const paystackResponse = await axios.post(
            `${PAYSTACK_API}/transaction/initialize`,
            {
                email: email,
                amount: amount,
                metadata: {
                    email: email,
                    subscription_months: subscription_months,
                    type: 'premium_upgrade'
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (paystackResponse.data.status) {
            const reference = paystackResponse.data.data.reference;

            payments.push({
                reference: reference,
                email: email,
                amount: appData.premium_monthly_price * subscription_months,
                status: 'pending',
                timestamp: new Date().toISOString()
            });

            res.json({
                success: true,
                authorization_url: paystackResponse.data.data.authorization_url,
                reference: reference
            });
        }
    } catch (err) {
        console.error('❌ Payment error:', err.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to initiate payment',
            details: err.message 
        });
    }
});

app.post('/api/premium/verify-payment', async (req, res) => {
    try {
        const { reference } = req.body;

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

        const verifyResponse = await axios.get(
            `${PAYSTACK_API}/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`
                }
            }
        );

        const data = verifyResponse.data.data;

        if (data.status === 'success') {
            const paymentRecord = payments.find(p => p.reference === reference);
            const email = data.metadata.email;
            const subscriptionMonths = data.metadata.subscription_months;

            if (paymentRecord) {
                paymentRecord.status = 'successful';
            }

            // ✅ MARK USER AS PREMIUM
            markUserAsPremium(email, subscriptionMonths);

            res.json({
                success: true,
                message: 'Payment verified! You are now premium.',
                status: data.status,
                amount: data.amount / 100,
                reference: reference,
                email: email
            });
        } else {
            res.json({
                success: false,
                message: 'Payment verification failed',
                status: data.status
            });
        }
    } catch (err) {
        console.error('❌ Verification error:', err.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to verify payment'
        });
    }
});

app.post('/api/premium/paystack-webhook', (req, res) => {
    try {
        const event = req.body;
        if (event.event === 'charge.success') {
            const email = event.data.customer.email;
            const reference = event.data.reference;
            
            console.log(`✅ Webhook: Payment success for ${email}`);
            
            // ✅ MARK AS PREMIUM ON WEBHOOK TOO
            markUserAsPremium(email, 1);
            
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

// ============ CHECK PREMIUM STATUS ============
app.get('/api/premium/check/:email', (req, res) => {
    const { email } = req.params;
    const isPremium = isPremiumUser(email);
    
    res.json({
        success: true,
        email: email,
        isPremium: isPremium,
        user: isPremium ? premiumUsers[email.toLowerCase()] : null
    });
});

// ============ ADMIN: VIEW PREMIUM USERS ============
app.get('/api/admin/premium-users', verifyAdmin, (req, res) => {
    res.json({
        success: true,
        premium_users: Object.values(premiumUsers),
        total: Object.keys(premiumUsers).length
    });
});

// ============ ADMIN: VIEW PAYMENTS ============
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

// ============ EMAIL SIGNUP ============
app.post('/api/email-signup', (req, res) => {
    try {
        const { name, email } = req.body;
        if (!email || !name) {
            return res.status(400).json({ error: 'Name and email required' });
        }
        res.json({ success: true, message: 'Signup successful' });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// ============ 404 & ERROR ============
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 BrandsTrack Backend v3.0`);
    console.log(`💳 Paystack: ACTIVE`);
    console.log(`📊 Price: ₦${appData.premium_monthly_price}`);
    console.log(`👥 Premium Users: ${Object.keys(premiumUsers).length}`);
    console.log(`\n⏱️ Port: ${PORT}\n`);
});

module.exports = app;
